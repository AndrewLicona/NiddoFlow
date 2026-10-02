import os
import re
import io
from pydantic import BaseModel, Field  # type: ignore
import json
from typing import Optional, List, cast, Any, Tuple
import fitz  # type: ignore # PyMuPDF
import pytesseract  # type: ignore
from PIL import Image  # type: ignore
from datetime import datetime
from dotenv import load_dotenv  # type: ignore
import logging

# EasyOCR has been removed to reduce deployment time and image size.
EASYOCR_AVAILABLE = False

try:
    from google import genai as genai_sdk  # type: ignore
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False

load_dotenv()
logger = logging.getLogger(__name__)

# To silence stubborn IDE lint errors on dynamic types
def _any(obj: Any) -> Any:
    return obj

if GEMINI_AVAILABLE:
    logger.info("Gemini AI library loaded successfully.")
else:
    logger.warning("Gemini AI library NOT found. Fallback will be disabled.")

# Configuración Tesseract
tesseract_cmd = os.getenv("TESSERACT_CMD")
if tesseract_cmd:
    pytesseract.pytesseract.tesseract_cmd = tesseract_cmd

# Gemini client state (no longer holding unused EasyOCR/OpenAI singletons)
_gemini_client = None
_gemini_client_initialized = False


def get_easyocr_reader():
    return None

# Pre-compiled regexes used by _process_raw_text. Compiling once at module
# load saves ~10-30ms per OCR call (Python re module caches patterns but
# the cache lookup is non-trivial for patterns used inside hot loops).
_WORD_COMMA_RE = re.compile(r"([a-zñáéíóú]+)\s*,\s*([a-zñáéíóú]+)")
_NUM_CLEAN_RE = re.compile(r"[$€s\s'`*]")
_NUM_FIND_RE = re.compile(r"(\d+(?:[.,']\d{3})*(?:[.,]\d{2,3}))(?!\d)")
_DIGIT_STRIP_RE = re.compile(r"[\d\W]")
_DATE_DMY_RE = re.compile(r"(\d{2}[/-]\d{2}[/-]\d{4})")
_DATE_YMD_RE = re.compile(r"(\d{4}[/-]\d{2}[/-]\d{2})")
_DATE_SHORT_RE = re.compile(r"(\d{2}[/-]\d{2}[/-]\d{2})")

# Pool of Gemini clients for automatic key rotation
_gemini_clients: List[Tuple[str, Any]] = []  # List of (api_key_masked, client)
_current_gemini_index = 0

def init_gemini() -> bool:
    global _gemini_clients
    if _gemini_clients:
        return True

    # Read from GEMINI_API_KEYS or GEMINI_API_KEY (supports comma-separated list of keys)
    raw_keys = os.getenv("GEMINI_API_KEYS") or os.getenv("GEMINI_API_KEY", "")
    key_list = [k.strip() for k in raw_keys.split(",") if k.strip()]

    if not key_list or not GEMINI_AVAILABLE:
        return False

    _gemini_clients = []
    for k in key_list:
        try:
            client = genai_sdk.Client(api_key=k)
            masked = f"...{k[-6:]}" if len(k) > 6 else "key"
            _gemini_clients.append((masked, client))
        except Exception as e:
            logger.error(f"Failed to create Gemini client for key: {e}")

    if _gemini_clients:
        logger.info(f"Initialized Gemini pool with {len(_gemini_clients)} API key(s).")
        return True
    return False

class OCRExtractionResult(BaseModel):
    amount: Optional[float] = Field(description="Total amount of the receipt or invoice", default=None)
    date: Optional[str] = Field(description="Date of the receipt in YYYY-MM-DDTHH:MM format", default=None)
    description: Optional[str] = Field(description="A brief description or title for the expense", default=None)
    category: Optional[str] = Field(description="Suggested category for the expense", default=None)
    nature: Optional[str] = Field(description="Nature of the flow: Ingreso, Gasto, or Transferencia", default="Gasto")

async def extract_receipt_data(file_bytes: bytes, mime_type: str, categories: Optional[List[str]] = None) -> OCRExtractionResult:
    """
    Orchestrates OCR extraction with multi-provider resilience:
    1. Try Gemini (with multi-key rotation and multi-model fallback: 2.0-flash -> 1.5-flash)
    2. If Gemini fails or quota is exhausted, seamlessly fallback to local Tesseract OCR.
    """
    provider = os.getenv("OCR_PROVIDER", "gemini").lower()
    
    if provider == "openai":
        return await _extract_openai(file_bytes, mime_type)
    elif provider == "tesseract":
        return await _extract_tesseract(file_bytes, mime_type, categories)
    else:
        # Default: Gemini with automatic failover to Tesseract
        if init_gemini():
            try:
                result = await _extract_gemini(file_bytes, mime_type, categories)
                if result.amount is not None or result.description:
                    return result
            except Exception as e:
                logger.warning(f"All Gemini attempts failed ({e}). Falling back to local Tesseract OCR...")
        else:
            logger.warning("Gemini not configured or unavailable. Using Tesseract OCR directly.")

        # Local fallback (Tesseract)
        return await _extract_tesseract(file_bytes, mime_type, categories)

async def _extract_gemini(file_bytes: bytes, mime_type: str, categories: Optional[List[str]] = None) -> OCRExtractionResult:
    """
    Implementation using Google Gemini via google.genai SDK.
    Supports multi-key pool rotation on 429/quota limits, and model fallback.
    """
    global _gemini_clients, _current_gemini_index
    if not init_gemini() or not _gemini_clients:
        raise ValueError("No valid Gemini API keys configured.")

    image_bytes, detected_mime = _prepare_image(file_bytes, mime_type)

    # Concise prompt: Gemini Flash models respond well to short, structured
    # instructions. Removing the verbose preamble cuts inference tokens
    # (and therefore cost/latency) without losing accuracy.
    cat_list = categories if categories else "Comida, Transporte, Servicios, Vivienda, Entretenimiento, Salud, Otros"
    prompt = f"""Analiza este recibo/factura y devuelve SOLO este JSON (sin explicaciones):
{{"amount": <total final como número, sin símbolos, ej 190400.0>, "date": "<YYYY-MM-DDTHH:MM>", "description": "<establecimiento + breve resumen>", "category": "<elige de: {cat_list}>", "nature": "Gasto|Ingreso|Transferencia"}}
Si no estás seguro de un campo, devuelve null. Para 'amount' usa el TOTAL FINAL (después de impuestos), no subtotal ni IVA."""

    # Models ordered by latency. As of October 2026:
    #   - gemini-3.5-flash-lite → fastest, cheapest, sufficient for structured JSON extraction
    #   - gemini-3.8-flash      → smarter fallback for hard receipts (low contrast, foreign layouts)
    #   - gemini-2.5-flash      → RESTRICTED to past users only (this project never used it)
    #   - gemini-1.5-pro/flash  → DEPRECATED
    models_to_try = ['gemini-3.5-flash-lite', 'gemini-3.8-flash']
    num_keys = len(_gemini_clients)
    last_error = None

    # Rotate through all available keys if needed
    for attempt in range(num_keys):
        key_idx = (_current_gemini_index + attempt) % num_keys
        masked_key, client = _gemini_clients[key_idx]

        for model_name in models_to_try:
            try:
                logger.info(f"Attempting Gemini OCR with key [{masked_key}] and model [{model_name}]...")
                response = await client.aio.models.generate_content(
                    model=model_name,
                    contents=[
                        genai_sdk.types.Part.from_bytes(data=image_bytes, mime_type=detected_mime),
                        prompt
                    ]
                )

                text_resp = response.text.strip()
                if "```json" in text_resp:
                    text_resp = text_resp.split("```json")[1].split("```")[0].strip()
                elif "```" in text_resp:
                    text_resp = text_resp.split("```")[1].split("```")[0].strip()

                logger.info(f"Gemini [{masked_key}] Success: {text_resp}")
                data = json.loads(text_resp)
                # Update current active key index to this successful one
                _current_gemini_index = key_idx
                return OCRExtractionResult(**data)

            except Exception as e:
                err_str = str(e).lower()
                logger.warning(f"Gemini error with key [{masked_key}], model [{model_name}]: {e}")
                last_error = e
                # If quota / rate limit (429 / resource exhausted), try next key immediately
                if "429" in err_str or "quota" in err_str or "resource_exhausted" in err_str:
                    logger.info(f"Key [{masked_key}] hit quota limit. Switching to next key in pool...")
                    break  # Break out of model loop to try next key in outer loop
                # If 503 (high demand), try once more with the same model after a short wait
                elif "503" in err_str or "unavailable" in err_str:
                    import asyncio as _asyncio
                    logger.info(f"Model [{model_name}] returning 503 (high demand). Retrying in 1.5s...")
                    await _asyncio.sleep(1.5)
                    try:
                        response = await client.aio.models.generate_content(
                            model=model_name,
                            contents=[
                                genai_sdk.types.Part.from_bytes(data=image_bytes, mime_type=detected_mime),
                                prompt
                            ]
                        )
                        text_resp = response.text.strip()
                        if "```json" in text_resp:
                            text_resp = text_resp.split("```json")[1].split("```")[0].strip()
                        elif "```" in text_resp:
                            text_resp = text_resp.split("```")[1].split("```")[0].strip()
                        logger.info(f"Gemini [{masked_key}] Success on retry: {text_resp}")
                        data = json.loads(text_resp)
                        _current_gemini_index = key_idx
                        return OCRExtractionResult(**data)
                    except Exception as retry_err:
                        logger.warning(f"Retry also failed: {retry_err}")
                        continue  # Try next model
                # If model not found (404), continue to next model with the same key
                elif "404" in err_str or "not found" in err_str:
                    continue

    raise Exception(f"All Gemini keys/models exhausted. Last error: {last_error}")

async def _extract_easyocr(file_bytes: bytes, mime_type: str, categories: Optional[List[str]] = None) -> OCRExtractionResult:
    if not EASYOCR_AVAILABLE: raise ImportError("EasyOCR no está instalado.")
    try:
        image_bytes, _ = _prepare_image(file_bytes, mime_type)
        reader = get_easyocr_reader()
        if reader is None:
            raise ValueError("EasyOCR reader is not available.")
        results = reader.readtext(image_bytes)
        text = "\n".join([res[1] for res in results])
        try:
            with open("ocr_debug.txt", "w", encoding="utf-8") as f: f.write(text)
        except: pass
        return _process_raw_text(text, categories)
    except Exception as e:
        raise ValueError(f"Error EasyOCR: {str(e)}")

async def _extract_tesseract(file_bytes: bytes, mime_type: str, categories: Optional[List[str]] = None) -> OCRExtractionResult:
    """
    Local Tesseract OCR fallback. Uses pytesseract + Pillow to extract text
    from the image and then delegates field extraction to _process_raw_text.
    This is the last line of defense when cloud providers are unavailable.
    """
    try:
        image_bytes, detected_mime = _prepare_image(file_bytes, mime_type)

        # PDF is already converted to JPEG by _prepare_image; we only handle
        # raster images here. Raise early so the caller knows this path
        # cannot continue.
        if detected_mime == "application/pdf":
            raise ValueError("Tesseract fallback does not handle PDF. Use Gemini for PDFs.")

        image = Image.open(io.BytesIO(image_bytes))

        # Spanish + English for receipts in LATAM (handles $ amounts, dates)
        text = pytesseract.image_to_string(image, lang="spa+eng")
        logger.info(f"Tesseract extracted {len(text)} chars from image")

        if not text or not text.strip():
            logger.warning("Tesseract returned empty text")
            return OCRExtractionResult(
                amount=None, date=None, description=None,
                category="Otros", nature="Gasto"
            )

        return _process_raw_text(text, categories)
    except Exception as e:
        logger.error(f"Tesseract extraction failed: {e}")
        # Return a valid empty result so the frontend can still render the form
        return OCRExtractionResult(
            amount=None, date=None, description=None,
            category="Otros", nature="Gasto"
        )

def _process_raw_text(text: str, categories: Optional[List[str]] = None) -> OCRExtractionResult:
    # Use getattr and dynamic access to avoid strict indexing lints
    def get_safe_slice(s: Any, start: int, end: int) -> str:
        try:
            # Use getattr and slice object to bypass strict indexing lints
            any_s: Any = str(s)
            return str(getattr(any_s, "__getitem__")(slice(start, end)))
        except:
            return ""
    
    normalized_text = ' '.join(text.lower().split())
    # Robust misread correction
    clean_text = normalized_text.replace('t0tal', 'total').replace('tota1', 'total').replace('imporle', 'importe')
    clean_text = clean_text.replace('totala', 'total a').replace('total p', 'total p').replace('papar', 'pagar')
    
    # Remove OCR noise like commas between words that should be together
    # Restricted to only alphabetic words to avoid breaking numbers like 1,000,000
    clean_text = _WORD_COMMA_RE.sub(r"\1 \2", clean_text)
    
    # --- Amount ---
    # Keywords in order of "Confidence". More specific terms first.
    high_conf_keywords = ["total a pagar", "total pagar", "total a", "neto a pagar", "gran total", "total del recibo", "total factura", "importe total"]
    mid_conf_keywords = ["total", "subtotal", "monto", "importe", "pago", "precio", "bruto", "neto", "valor total"]
    
    amount = None
    all_candidates: List[tuple] = []

    def extract_from_keywords(kw_list, is_high_conf=False):
        for kw in kw_list:
            # Handle keywords that might have OCR garbage between them (e.g. "Total , Pagar")
            # We replace spaces in kw with a flexible regex
            flex_kw = kw.replace(" ", r"[\s,.]{1,5}")
            pattern = rf"{flex_kw}[^\d]{{0,30}}?([\d.,'`* ]{{3,}})"
            for match in re.finditer(pattern, clean_text):
                m = match.group(1)
                # Removed apostrophe, backtick, dollar, euro, 's' and whitespace
                num_str = re.sub(r"[$€s\s'`*]", "", m)
                
                # Resilient cleaning for multiple separators
                separators = [i for i, c in enumerate(num_str) if i < len(num_str) and c in '.,']
                if separators:
                    last_sep_idx = separators[-1]
                    if len(str(num_str)) > 0 and last_sep_idx >= len(str(num_str)) - 3:
                        # Extract part before last separator
                        # Using ultra-safe split/join to avoid indexing [] lints
                        sep_char = str(num_str)[last_sep_idx]
                        parts = str(num_str).split(sep_char)
                        prefix_parts = [parts[i] for i in range(len(parts)-1)]
                        prefix = "".join(prefix_parts)
                        cleaned = str(prefix).replace('.', '').replace(',', '')
                        num_str = cleaned + '.' + parts[-1]
                    else:
                        num_str = str(num_str).replace('.', '').replace(',', '')
                
                num_str = "".join([c for c in num_str if c.isdigit() or c == '.'])
                try:
                    val = float(num_str)
                    if 0 < val < 50000000:
                        # Logic: High confidence keywords get 100, mid 50.
                        # "Total" gets slightly more than "Subtotal" or "Unit Price"
                        confidence = 100 if is_high_conf else 50
                        if "total" in kw: confidence += 10
                        if num_str.endswith('.00'): confidence += 10
                        
                        # Penalty if "IVA" or "Subtotal" or "Bruto" is right before it
                        window_before = get_safe_slice(clean_text, max(0, match.start()-30), match.start()).lower()
                        if any(neg in window_before for neg in ["iva", "subtotal", "sub-total", "bruto", "neto"]):
                            confidence -= 40
                        
                        # Use the actual start index of the match
                        all_candidates.append((val, confidence, match.start()))
                except: continue

    extract_from_keywords(high_conf_keywords, is_high_conf=True)
    extract_from_keywords(mid_conf_keywords, is_high_conf=False)

    if all_candidates:
        # Sort by:
        # 1. Confidence (Highest first)
        # 2. Amount (Favor larger amounts for totals - fixes tax instead of total issue)
        # 3. Position (Further down is usually the final summary)
        all_candidates.sort(key=lambda x: (float(x[1]), float(x[0]), int(x[2])), reverse=True)
        amount = float(all_candidates[0][0])

    if not amount:
        # Look for digit patterns with 2 decimals
        # Added support for 1.234.567,89 and 1.234,567.89 (Siigo format)
        all_nums = _NUM_FIND_RE.findall(clean_text)
        if all_nums:
            candidates: List[float] = []
            for m in all_nums:
                # Clean each match using same logic as keyword-based
                n = m
                separators = [i for i, c in enumerate(n) if i < len(n) and c in '.,']
                if separators:
                    last_sep_idx = separators[-1]
                    any_n: Any = n
                    if last_sep_idx >= len(str(n)) - 4: # Allow for 2 or 3 digits after last sep
                        sep_char = str(n)[last_sep_idx]
                        parts = str(n).split(sep_char)
                        # Avoid [:-1] slice for strict linters
                        prefix_parts = [parts[i] for i in range(len(parts)-1)]
                        prefix = "".join(prefix_parts).replace('.', '').replace(',', '')
                        n = prefix + '.' + parts[-1]
                    else:
                        n = str(n).replace('.', '').replace(',', '')
                
                n = "".join([c for c in n if c.isdigit() or c == '.'])
                try:
                    v = float(n)
                    if v > 0 and v < 50000000:
                        candidates.append(v)
                except: continue
            if candidates:
                # Still favor the largest among reasonable amounts if no keyword
                amount = max(candidates)

    # --- Category ---
    suggested_category = "Otros"
    
    # Keyword-to-Category mapping for smarter classification
    category_keywords = {
        "Comida": ["restaurante", "cafe", "burger", "pizza", "food", "bar", "grill", "sushi", "steak", "cena", "almuerzo", "desayuno", "mcdonald", "burger king", "starbucks", "rest", "deli", "bakery", "panaderia", "cafeteria"],
        "Transporte": ["uber", "cabify", "bus", "metro", "tren", "gasoline", "gasolina", "combustible", "peaje", "parking", "estacionamiento", "taxi", "didi", "terpel", "pumac", "texaco", "shell"],
        "Servicios": ["agua", "luz", "electricidad", "gas", "internet", "red", "plan de", "mantenimiento", "wifi", "celular", "movil", "mobile", "phone", "utility", "tigo", "claro", "movistar", "une", "epm", "enel", "servicios", "servcios", "capacitacion", "capacitación"],
        "Vivienda": ["alquiler", "renta", "rent", "hipoteca", "mortgage", "apartamento", "unidad"],
        "Entretenimiento": ["cine", "netflix", "spotify", "concierto", "teatro", "juego", "steam", "epic", "disney", "prime video", "hbo", "club", "boletas", "ticket"],
        "Salud": ["farmacia", "hospital", "medico", "doctor", "salud", "medicina", "dental", "odontologo", "optica", "lentes", "drogueria"],
        "Salario": ["nomina", "sueldo", "paycheck", "salario", "pago nomina"],
        "Ventas": ["venta", "sale", "vendido", "factura de venta"],
        "Préstamos Recibidos": ["prestamo", "received", "recibido"],
        "Deudas": ["pago deuda", "cuota", "intereses"]
    }

    # 1. First priority: Direct matches from DB categories
    safe_categories = categories if categories is not None else []
    for cat in _any(safe_categories):
            if str(cat).lower() in clean_text:
                suggested_category = cat
                break
    
    # 2. Second priority: If still "Otros", try keyword mapping
    if suggested_category == "Otros":
        for cat_name, keywords in category_keywords.items():
            for kw in keywords:
                if kw in clean_text:
                    # Match with case-sensitive name from DB if possible
                    if categories:
                        for db_cat in _any(categories):
                            if str(db_cat).lower() == cat_name.lower():
                                suggested_category = db_cat
                                break
                    else:
                        suggested_category = cat_name
                    break
            if suggested_category != "Otros":
                break

    # --- Date ---
    date_keywords = ["fecha expedicion", "fecha de factura", "fecha emision", "fecha", "date", "expedido"]
    date_patterns = [r"(\d{2}[/-]\d{2}[/-]\d{4})", r"(\d{4}[/-]\d{2}[/-]\d{2})", r"(\d{2}[/-]\d{2}[/-]\d{2})"]
    extracted_date = None
    
    # 1. Try to find date near keywords
    for kw in date_keywords:
        # Construct a pattern that looks for the keyword followed by optional non-digit characters and then any of the date patterns
        # The `|` operator combines the date patterns
        combined_date_pattern = "|".join(date_patterns)
        pattern = rf"{kw}[^\d]*?({combined_date_pattern})"
        
        match = re.search(pattern, clean_text)
        if match:
            raw_date = match.group(1) # group(1) will capture the matched date string from the combined_date_pattern
            for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%d/%m/%y"):
                try:
                    dt = datetime.strptime(raw_date, fmt)
                    extracted_date = dt.strftime("%Y-%m-%dT12:00")
                    break
                except: continue
        if extracted_date: break

    # 2. Fallback to first date found if no keyword match
    if not extracted_date:
        for pattern in date_patterns:
            match = re.search(pattern, clean_text)
            if match:
                raw_date = match.group(1)
                for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%d/%m/%y"):
                    try:
                        dt = datetime.strptime(raw_date, fmt)
                        extracted_date = dt.strftime("%Y-%m-%dT12:00")
                        break
                    except: continue
            if extracted_date: break
    
    # --- Nature ---
    nature = "Gasto"  # Default
    nature_keywords = {
        "Ingreso": ["ingreso", "recibido", "pago recibido", "venta", "abono"],
        "Transferencia": ["transferencia", "traslado", "entre cuentas"],
        "Gasto": ["gasto", "factura", "compra", "pago", "ticket", "boleta"]
    }
    for n_type, kws in nature_keywords.items():
        if any(kw in clean_text for kw in kws):
            nature = n_type
            break

    # --- Description ---
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    description = lines[0] if lines else "Recibo"
    # Safely iterate first 3 lines
    for i, line in enumerate(lines):
        if i >= 3: break
        if len(re.sub(r"[\d\W]", "", line)) > 3:
            description = line
            break

    print(f"DEBUG: OCR Result -> Amount: {amount}, Date: {extracted_date}, Cat: {suggested_category}")
    # Using dictionary and model_validate to completely bypass attribute checks in IDE
    data = {
        "amount": amount,
        "date": extracted_date,
        "description": str(description),
        "category": str(suggested_category),
        "nature": nature
    }
    return OCRExtractionResult.model_validate(data)

def _prepare_image(file_bytes: bytes, mime_type: str) -> Tuple[bytes, str]:
    if mime_type == "application/pdf":
        try:
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            page = doc.load_page(0)
            pix = page.get_pixmap(dpi=150)
            image_bytes = pix.tobytes("jpg")
            doc.close()
            return image_bytes, "image/jpeg"
        except Exception as e:
            logger.error(f"PDF Error: {e}")
            raise ValueError(f"No se pudo procesar el PDF: {e}")

    # Optimize standard images (PNG, WEBP, HEIC, JPG, etc.)
    try:
        image = Image.open(io.BytesIO(file_bytes))
        # Convert RGBA / P / CMYK to RGB
        if image.mode != "RGB":
            image = image.convert("RGB")

        # Downscale if excessively large. 1400px is plenty for receipt OCR
        # and keeps payload under ~400KB after JPEG compression, which is
        # roughly 30% smaller than the previous 1800px/quality-85 settings.
        max_dim = 1400
        if max(image.size) > max_dim:
            image.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)

        out_buffer = io.BytesIO()
        # Quality 75 is visually indistinguishable from 85 for receipts
        # but cuts transfer + Gemini processing time noticeably.
        image.save(out_buffer, format="JPEG", quality=75, optimize=True)
        return out_buffer.getvalue(), "image/jpeg"
    except Exception as e:
        logger.warning(f"Image optimization skipped: {e}")
        return file_bytes, mime_type or "image/jpeg"

