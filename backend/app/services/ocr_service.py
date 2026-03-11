import os
import base64
import re
import io
from typing import Optional, List
from pydantic import BaseModel, Field
import json
import openai
import fitz  # PyMuPDF
import pytesseract
from PIL import Image
from datetime import datetime
from dotenv import load_dotenv
import logging

# EasyOCR has been removed to reduce deployment time and image size.
EASYOCR_AVAILABLE = False

try:
    from google import genai as genai_sdk
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False

load_dotenv()
logger = logging.getLogger(__name__)

if GEMINI_AVAILABLE:
    logger.info("Gemini AI library loaded successfully.")
else:
    logger.warning("Gemini AI library NOT found. Fallback will be disabled.")

# OpenAI client is created lazily inside _extract_openai to avoid
# crashing on startup when OPENAI_API_KEY is not configured.
_openai_client = None

# Configuración Tesseract
tesseract_cmd = os.getenv("TESSERACT_CMD")
if tesseract_cmd:
    pytesseract.pytesseract.tesseract_cmd = tesseract_cmd

# Cache EasyOCR Reader instance
_easyocr_reader = None
_gemini_client = None
_gemini_client_initialized = False

def get_openai_client():
    global _openai_client
    if _openai_client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable is not set.")
        _openai_client = openai.AsyncOpenAI(api_key=api_key)
    return _openai_client


def get_easyocr_reader():
    return None

def init_gemini():
    global _gemini_client, _gemini_client_initialized
    api_key = os.getenv("GEMINI_API_KEY")
    if api_key and GEMINI_AVAILABLE and not _gemini_client_initialized:
        _gemini_client = genai_sdk.Client(api_key=api_key)
        _gemini_client_initialized = True
    return _gemini_client_initialized

class OCRExtractionResult(BaseModel):
    amount: Optional[float] = Field(description="Total amount of the receipt or invoice", default=None)
    date: Optional[str] = Field(description="Date of the receipt in YYYY-MM-DDTHH:MM format", default=None)
    description: Optional[str] = Field(description="A brief description or title for the expense", default=None)
    category: Optional[str] = Field(description="Suggested category for the expense", default=None)
    nature: Optional[str] = Field(description="Nature of the flow: Ingreso, Gasto, or Transferencia", default="Gasto")

async def extract_receipt_data(file_bytes: bytes, mime_type: str, categories: Optional[List[str]] = None) -> OCRExtractionResult:
    """
    Orchestrates OCR extraction based on the configured provider.
    """
    provider = os.getenv("OCR_PROVIDER", "easyocr").lower()
    
    if provider == "openai":
        return await _extract_openai(file_bytes, mime_type)
    elif provider == "tesseract":
        return await _extract_tesseract(file_bytes, mime_type, categories)
    elif provider == "gemini":
        return await _extract_gemini(file_bytes, mime_type, categories)
    else:
        # STRATEGY: Gemini-First for speed/intelligence.
        # Tesseract is the local fallback.
        
        if os.getenv("GEMINI_API_KEY"):
            logger.info("Using Gemini AI as primary provider for maximum speed and accuracy...")
            try:
                result = await _extract_gemini(file_bytes, mime_type, categories)
                if result.amount is not None:
                    return result
            except Exception as e:
                logger.warning(f"Gemini primary failed (likely quota): {e}. Falling back to local OCR...")

        # Fallback to Local OCR (Tesseract)
        return await _extract_tesseract(file_bytes, mime_type, categories)

async def _extract_openai(file_bytes: bytes, mime_type: str) -> OCRExtractionResult:
    """Original implementation using GPT-4o-mini"""
    if not os.getenv("OPENAI_API_KEY"):
        raise ValueError("OPENAI_API_KEY environment variable is not set.")

    image_bytes, current_mime = _prepare_image(file_bytes, mime_type)
    base64_image = base64.b64encode(image_bytes).decode('utf-8')
    data_uri = f"data:{current_mime};base64,{base64_image}"

    prompt = """
    Analiza la siguiente imagen de un recibo o factura y extrae la siguiente información:
    1. El "monto" total a pagar (solo el número decimal, sin símbolos de moneda).
    2. La "fecha" de la transacción, formateada en ISO 8601 (YYYY-MM-DDTHH:MM). Si no hay hora, asume 12:00.
    3. Una "descripción" breve del gasto que incluya el nombre del comercio.
    4. Una "categoría" sugerida para este gasto.

    Devuelve la respuesta estrictamente en formato JSON:
    {
      "amount": número flotante o null,
      "date": "YYYY-MM-DDTHH:MM" o null,
      "description": "string" o null,
      "category": "string" o null
    }
    """

    try:
        c = get_openai_client()
        response = await c.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": [{"type": "text", "text": prompt}, {"type": "image_url", "image_url": {"url": data_uri}}]}],
            response_format={ "type": "json_object" },
            max_tokens=300
        )
        data = json.loads(response.choices[0].message.content)
        return OCRExtractionResult(**data)
    except Exception as e:
        logger.error(f"OpenAI API Error: {str(e)}")
        raise e

async def _extract_tesseract(file_bytes: bytes, mime_type: str, categories: Optional[List[str]] = None) -> OCRExtractionResult:
    try:
        image_bytes, _ = _prepare_image(file_bytes, mime_type)
        image = Image.open(io.BytesIO(image_bytes))
        text = pytesseract.image_to_string(image, lang='spa+eng')
        return _process_raw_text(text, categories)
    except Exception as e:
        raise ValueError(f"Error Tesseract: {str(e)}")

async def _extract_gemini(file_bytes: bytes, mime_type: str, categories: Optional[List[str]] = None) -> OCRExtractionResult:
    """Implementation using Google Gemini 2.0 Flash via the new google.genai SDK."""
    if not init_gemini():
        raise ValueError("Gemini API Key not set or library not found.")

    image_bytes, _ = _prepare_image(file_bytes, mime_type)
    
    prompt = f"""
    Eres un experto en contabilidad. Analiza esta factura/recibo y extrae CRIMINALMENTE EXACTO:
    1. 'amount': El Monto TOTAL final a pagar (número puro). 
       - ¡CUIDADO! Si ves '190.400,00' el monto es 190400.0. NO agregues ceros extra.
       - Si ves millones como 1'160.000 es 1160000.0.
    2. 'date': La fecha de la transacción (YYYY-MM-DDTHH:MM).
    3. 'description': Nombre del establecimiento y breve resumen de compra.
    4. 'category': Elige la mejor categoría de esta lista: {categories if categories else "Comida, Transporte, Servicios, Vivienda, Entretenimiento, Salud, Otros"}.
    5. 'nature': Clasifica si es un 'Gasto', 'Ingreso' o 'Transferencia'. 
       - Si es una factura de VENTA recibida, es un 'Gasto'.
       - Si es un recibo de PAGO a tu favor, es un 'Ingreso'.

    IMPORTANTE: Si no estás seguro de algo, devuelve null. 
    Respuesta puramente en JSON:
    {{"amount": null, "date": null, "description": null, "category": "Otros", "nature": "Gasto"}}
    """

    try:
        import base64 as b64
        image_b64 = b64.b64encode(image_bytes).decode('utf-8')
        
        response = await _gemini_client.aio.models.generate_content(
            model='gemini-2.0-flash',
            contents=[
                genai_sdk.types.Part.from_bytes(data=image_bytes, mime_type='image/jpeg'),
                prompt
            ]
        )
        
        text_resp = response.text.strip()
        if "```json" in text_resp:
            text_resp = text_resp.split("```json")[1].split("```")[0].strip()
        elif "```" in text_resp:
            text_resp = text_resp.split("```")[1].split("```")[0].strip()
            
        logger.info(f"Gemini RAW Response: {text_resp}")
        data = json.loads(text_resp)
        return OCRExtractionResult(**data)
    except Exception as e:
        logger.error(f"Gemini API Error: {str(e)}")
        raise e

async def _extract_easyocr(file_bytes: bytes, mime_type: str, categories: Optional[List[str]] = None) -> OCRExtractionResult:
    if not EASYOCR_AVAILABLE: raise ImportError("EasyOCR no está instalado.")
    try:
        image_bytes, _ = _prepare_image(file_bytes, mime_type)
        reader = get_easyocr_reader()
        results = reader.readtext(image_bytes)
        text = "\n".join([res[1] for res in results])
        try:
            with open("ocr_debug.txt", "w", encoding="utf-8") as f: f.write(text)
        except: pass
        return _process_raw_text(text, categories)
    except Exception as e:
        raise ValueError(f"Error EasyOCR: {str(e)}")

def _process_raw_text(text: str, categories: Optional[List[str]] = None) -> OCRExtractionResult:
    normalized_text = ' '.join(text.lower().split())
    # Robust misread correction
    clean_text = normalized_text.replace('t0tal', 'total').replace('tota1', 'total').replace('imporle', 'importe')
    clean_text = clean_text.replace('totala', 'total a').replace('total p', 'total p').replace('papar', 'pagar')
    
    # Remove OCR noise like commas between words that should be together
    # Restricted to only alphabetic words to avoid breaking numbers like 1,000,000
    clean_text = re.sub(r"([a-zñáéíóú]+)\s*,\s*([a-zñáéíóú]+)", r"\1 \2", clean_text)
    
    # --- Amount ---
    # Keywords in order of "Confidence". More specific terms first.
    high_conf_keywords = ["total a pagar", "total pagar", "total a", "neto a pagar", "gran total", "total del recibo", "total factura", "importe total"]
    mid_conf_keywords = ["total", "subtotal", "monto", "importe", "pago", "precio", "bruto", "neto", "valor total"]
    
    amount = None
    all_candidates = []

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
                    if last_sep_idx >= len(num_str) - 3:
                        cleaned = num_str[:last_sep_idx].replace('.', '').replace(',', '')
                        num_str = cleaned + '.' + num_str[last_sep_idx+1:]
                    else:
                        num_str = num_str.replace('.', '').replace(',', '')
                
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
                        window_before = clean_text[max(0, match.start()-30):match.start()].lower()
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
        all_candidates.sort(key=lambda x: (x[1], x[0], x[2]), reverse=True)
        amount = all_candidates[0][0]

    if not amount:
        # Look for digit patterns with 2 decimals
        # Added support for 1.234.567,89 and 1.234,567.89 (Siigo format)
        all_nums = re.findall(r"(\d+(?:[.,']\d{3})*(?:[.,]\d{2,3}))(?!\d)", clean_text)
        if all_nums:
            candidates = []
            for m in all_nums:
                # Clean each match using same logic as keyword-based
                n = m
                separators = [i for i, c in enumerate(n) if i < len(n) and c in '.,']
                if separators:
                    last_sep_idx = separators[-1]
                    if last_sep_idx >= len(n) - 4: # Allow for 2 or 3 digits after last sep
                        prefix = n[:last_sep_idx].replace('.', '').replace(',', '')
                        n = prefix + '.' + n[last_sep_idx+1:]
                    else:
                        n = n.replace('.', '').replace(',', '')
                
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
    if categories:
        for cat in categories:
            if cat.lower() in clean_text:
                suggested_category = cat
                break
    
    # 2. Second priority: If still "Otros", try keyword mapping
    if suggested_category == "Otros":
        for cat_name, keywords in category_keywords.items():
            for kw in keywords:
                if kw in clean_text:
                    # Match with case-sensitive name from DB if possible
                    if categories:
                        for db_cat in categories:
                            if db_cat.lower() == cat_name.lower():
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

    # --- Description ---
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    description = lines[0] if lines else "Recibo"
    for line in lines[:3]:
        if len(re.sub(r"[\d\W]", "", line)) > 3:
            description = line
            break

    print(f"DEBUG: OCR Result -> Amount: {amount}, Date: {extracted_date}, Cat: {suggested_category}")
    return OCRExtractionResult(amount=amount, date=extracted_date, description=description, category=suggested_category)

def _prepare_image(file_bytes: bytes, mime_type: str):
    if mime_type == "application/pdf":
        try:
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            page = doc.load_page(0)
            pix = page.get_pixmap()
            image_bytes = pix.tobytes("jpg")
            doc.close()
            return image_bytes, "image/jpeg"
        except Exception as e:
            logger.error(f"PDF Error: {e}")
            raise ValueError(f"No se pudo procesar el PDF: {e}")
    return file_bytes, mime_type
