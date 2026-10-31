"""Servicio de OCR de recibos y facturas.

Pipeline:
  1. Preprocesado de la imagen (`_prepare_payload`): rasterizado, resize a 1400px,
     JPEG calidad 75 y —para PDFs— concatenación vertical de hasta 5 páginas (O1).
  2. Extracción con Gemini (rotación de claves `GEMINI_API_KEYS` + fallback de
     modelos) usando un prompt que restringe las categorías (O5) y pide cuotas
     (O2), confianza (O3), comercio normalizado (O4) y subtotal/IVA/descuento/
     propina (O7).
  3. Validación y normalización de la respuesta: las categorías siempre salen de
     la lista real de la familia, el comercio se normaliza y se calcula el hash
     de la imagen (O6).
  4. Fallback local con Tesseract si Gemini falla o no está configurado.

Las funciones son puras salvo `_extract_gemini` (red) y `_find_duplicate` (BD),
que siempre están protegidas con try/except para no romper el flujo del usuario.
"""

import os
import re
import io
import json
import hashlib
import unicodedata
import inspect
from dataclasses import dataclass
from pydantic import BaseModel, Field, field_validator  # type: ignore
from typing import Any, Dict, List, Optional, Tuple, Union
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


# --------------------------------------------------------------------------- #
# Límites de preprocesamiento (control de tokens y tamaño de la petición)
# --------------------------------------------------------------------------- #
MAX_PDF_PAGES = 5       # Máximo de páginas leídas de un PDF (O1)
MAX_IMAGE_DIM = 1400    # Lado mayor máximo de cada imagen
JPEG_QUALITY = 75       # Calidad JPEG de salida

# Categorías por defecto (solo se usan si la familia no tiene ninguna)
DEFAULT_CATEGORY_LIST = [
    "Comida", "Transporte", "Servicios", "Vivienda",
    "Entretenimiento", "Salud", "Otros",
]

# Sufijos corporativos que se eliminan del nombre del comercio (O4).
# El orden importa: "S.A.S." debe evaluarse antes que "S.A.".
_CORP_SUFFIX_RE = re.compile(
    r"\b(?:s\.?\s*a\.?\s*s\.?|s\.?\s*a\.?|l\.?\s*t\.?\s*d\.?\s*a\.?|e\.?\s*u\.?|s\.?\s*l\.?)\b\.?",
    re.IGNORECASE,
)

# Etiquetas para los importes opcionales (O7)
_SUBTOTAL_LABELS = ["subtotal", "sub total", "sub-total", "total parcial", "base imponible"]
_TAX_LABELS = ["iva", "i.v.a", "impuesto", "impuestos", "tax"]
_DISCOUNT_LABELS = ["descuento", "descuentos", "discount", "dcto", "rebaja"]
_TIP_LABELS = ["propina", "tip"]
# "Total de la compra" (distinto del total de la cuota pagada)
_PURCHASE_TOTAL_LABELS = [
    "total de la compra", "total compra", "valor total de la compra",
    "monto total de la compra", "monto de la compra", "compra total",
    "total del purchase", "purchase total",
]

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

# Solo se avisa una vez por proceso si el matcher de categorías no existe aún
_matcher_warning_logged = False


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


# --------------------------------------------------------------------------- #
# Modelos de respuesta (contrato §4.2)
# --------------------------------------------------------------------------- #
def _clamp_confidence(value: Any) -> float:
    """Normaliza cualquier valor a un float dentro de [0, 1].

    Los valores fuera de rango (incluidos porcentajes como 95) se acotan al
    límite más cercano; los valores no numéricos se consideran 0.
    """
    if value is None or isinstance(value, bool):
        return 0.0
    try:
        num = float(value)
    except (TypeError, ValueError):
        return 0.0
    if num != num:  # NaN
        return 0.0
    if num < 0:
        return 0.0
    if num > 1:
        return 1.0
    return num


class OCRConfidence(BaseModel):
    """Confianza (0-1) por campo clave de la extracción (O3)."""
    amount: float = Field(default=0.0, description="Confianza en el monto")
    date: float = Field(default=0.0, description="Confianza en la fecha")
    merchant: float = Field(default=0.0, description="Confianza en el comercio")
    total: float = Field(default=0.0, description="Confianza en el total final")

    @field_validator("amount", "date", "merchant", "total", mode="before")
    @classmethod
    def _clamp(cls, value: Any) -> float:
        return _clamp_confidence(value)


class OCRInstallments(BaseModel):
    """Cuotas de tarjeta (O2). `None` cuando el pago no es a cuotas."""
    current: Optional[int] = Field(default=None, description="Cuota que se está pagando")
    total: Optional[int] = Field(default=None, description="Número total de cuotas")
    purchase_total_amount: Optional[float] = Field(
        default=None, description="Monto total de la compra (no el de la cuota)"
    )


class OCRItemResult(BaseModel):
    item_name: str = Field(description="Name or description of the purchased item")
    quantity: float = Field(description="Quantity purchased", default=1.0)
    unit_price: float = Field(description="Price per single unit", default=0.0)
    total_price: float = Field(description="Total price for this item line", default=0.0)
    category: Optional[str] = Field(
        description="Categoría EXACTA de la lista de la familia o null", default=None
    )
    category_id: Optional[str] = Field(
        description="UUID de la categoría resuelta por el matcher", default=None
    )
    confidence: Optional[float] = Field(
        description="Confianza 0-1 del item", default=None
    )
    category_raw: Optional[str] = Field(
        description="Categoría inventada por el modelo (se conserva sin validar)", default=None
    )

    @field_validator("confidence", mode="before")
    @classmethod
    def _clamp_item_confidence(cls, value: Any) -> Optional[float]:
        if value is None:
            return None
        return _clamp_confidence(value)


class OCRExtractionResult(BaseModel):
    amount: Optional[float] = Field(description="Total amount of the receipt or invoice", default=None)
    date: Optional[str] = Field(description="Date of the receipt in YYYY-MM-DDTHH:MM format", default=None)
    description: Optional[str] = Field(description="A brief description or title for the expense", default=None)
    category: Optional[str] = Field(
        description="Categoría EXACTA de la lista de la familia o null", default=None
    )
    nature: Optional[str] = Field(description="Nature of the flow: Ingreso, Gasto, or Transferencia", default="Gasto")
    merchant: Optional[str] = Field(
        description="Comercio normalizado (sin sufijos corporativos)", default=None
    )
    merchant_raw: Optional[str] = Field(
        description="Comercio tal como aparece en el recibo", default=None
    )
    confidence: Optional[OCRConfidence] = Field(
        description="Confianza 0-1 por campo", default=None
    )
    installments: Optional[OCRInstallments] = Field(
        description="Cuotas de la compra (null si no aplica)", default=None
    )
    items: Optional[List[OCRItemResult]] = Field(
        description="List of individual items/products bought if itemized on the receipt",
        default_factory=list,
    )
    category_raw: Optional[str] = Field(
        description="Categoría inventada por el modelo (se conserva sin validar)", default=None
    )
    subtotal: Optional[float] = Field(description="Subtotal antes de impuestos", default=None)
    tax: Optional[float] = Field(description="IVA / impuestos", default=None)
    discount: Optional[float] = Field(description="Descuento aplicado", default=None)
    tip: Optional[float] = Field(description="Propina", default=None)
    duplicate: bool = Field(description="Indica si el recibo ya fue registrado", default=False)
    duplicate_of: Optional[str] = Field(
        description="Id de la transacción duplicada (si se pudo determinar)", default=None
    )
    image_hash: Optional[str] = Field(
        description="Hash sha256 de la imagen procesada (para detectar duplicados)", default=None
    )


# --------------------------------------------------------------------------- #
# Utilidades de normalización
# --------------------------------------------------------------------------- #
@dataclass
class PreparedImage:
    """Imagen lista para enviar al modelo."""
    data: bytes
    mime: str
    image_hash: str
    page_count: int = 1


def _normalize_key(text: Any) -> str:
    """Clave de comparación: minúsculas, sin tildes y sin espacios extra."""
    if text is None:
        return ""
    normalized = unicodedata.normalize("NFKD", str(text))
    stripped = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", stripped.strip().lower())


def _to_float(value: Any) -> Optional[float]:
    """Convierte a float tolerando símbolos, separadores de miles y decimales."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = re.sub(r"[^\d,.\-]", "", str(value))
    if not text or text in {"-", ".", ","}:
        return None
    if "," in text and "." in text:
        # El separador decimal es el que aparece más a la derecha
        if text.rfind(",") > text.rfind("."):
            text = text.replace(".", "").replace(",", ".")
        else:
            text = text.replace(",", "")
    elif "," in text:
        parts = text.split(",")
        if len(parts) == 2 and len(parts[1]) == 3:
            text = text.replace(",", "")   # separador de miles
        else:
            text = text.replace(",", ".")
    elif "." in text:
        parts = text.split(".")
        # Formato colombiano: "19.000" son nineteen mil, no 19.0
        if len(parts) == 2 and len(parts[1]) == 3:
            text = text.replace(".", "")
    try:
        return float(text)
    except ValueError:
        return None


def _normalize_date(value: Any) -> Optional[str]:
    """Normaliza la fecha a `YYYY-MM-DDTHH:MM` (lo que espera el formulario)."""
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    match = re.match(r"(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?", text)
    if match:
        return f"{match.group(1)}T{match.group(2) or '12:00'}"
    return text


def _normalize_merchant(raw: Optional[str]) -> Optional[str]:
    """Normaliza el nombre del comercio (O4).

    Quita sufijos corporativos (S.A.S., S.A., SA, Ltda, E.U., S.L.), colapsa
    espacios y aplica Title Case a cada palabra.
    """
    if not raw:
        return None
    text = str(raw).strip()
    if not text:
        return None
    cleaned = _CORP_SUFFIX_RE.sub(" ", text)
    cleaned = re.sub(r"[^\w\sáéíóúüñÁÉÍÓÚÜÑ&.\-/]", " ", cleaned)
    cleaned = re.sub(r"(?<![A-Za-z0-9])\.|\.(?![A-Za-z0-9])", " ", cleaned)
    cleaned = re.sub(r"[\s\-_,;:+]+", " ", cleaned).strip()
    words = [w for w in cleaned.split(" ") if w]
    if not words:
        return None
    return " ".join(w.capitalize() for w in words)


def _normalize_categories(
    categories: Optional[List[Union[str, Dict[str, Any]]]],
) -> Tuple[List[str], List[Dict[str, Any]]]:
    """Normaliza la lista de categorías a (nombres, registros).

    Acepta nombres sueltos (`"Alimentación"`) o registros completos
    (`{"id": ..., "name": ..., "type": ...}`).
    """
    names: List[str] = []
    records: List[Dict[str, Any]] = []
    for cat in categories or []:
        if isinstance(cat, dict):
            name = str(cat.get("name") or "").strip()
            record: Dict[str, Any] = {
                "id": cat.get("id"),
                "name": name,
                "type": cat.get("type"),
                "is_default": cat.get("is_default"),
            }
        else:
            name = str(cat).strip()
            record = {"id": None, "name": name, "type": None, "is_default": None}
        if not name:
            continue
        names.append(name)
        records.append(record)
    return names, records


def _find_record_by_name(name: Optional[str], records: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Busca un registro de categoría por nombre (case-insensitive, sin tildes)."""
    key = _normalize_key(name)
    if not key:
        return None
    for record in records:
        if _normalize_key(record.get("name")) == key:
            return record
    return None


def _extract_labeled_amount(text: str, labels: List[str]) -> Optional[float]:
    """Busca un importe junto a una etiqueta (subtotal, iva, descuento...).

    Ignora los porcentajes (ej. "IVA 19%") y devuelve el primer importe válido.
    """
    if not text:
        return None
    low = text.lower()
    for label in labels:
        pattern = re.escape(label).replace(r"\ ", r"[\s\-_]{1,4}")
        for match in re.finditer(rf"\b{pattern}\b([^\d\-]{{0,25}}?)(\d[\d.,\s]*)", low):
            # Si el número va seguido de "%" es un porcentaje, no un importe
            if low[match.end(2):match.end(2) + 1] == "%":
                continue
            value = _to_float(match.group(2))
            if value is not None and value > 0:
                return value
    return None


def _parse_installments(text: str) -> Optional[OCRInstallments]:
    """Detecta cuotas de tarjeta en texto plano (O2, fallback Tesseract).

    Reconoce "cuota 2 de 3", "2/3 cuotas", "3 cuotas" y "total de la compra".
    """
    if not text:
        return None
    clean = ' '.join(str(text).lower().split())

    current: Optional[int] = None
    total: Optional[int] = None

    match = re.search(r"cuota\s*(\d{1,2})\s*(?:de|/)\s*(\d{1,2})", clean)
    if match:
        current, total = int(match.group(1)), int(match.group(2))
    else:
        match = re.search(r"(\d{1,2})\s*(?:de\s+)?cuotas?", clean)
        if match:
            total = int(match.group(1))

    if current is None and total is None:
        return None

    purchase_total = _extract_labeled_amount(clean, _PURCHASE_TOTAL_LABELS)
    return OCRInstallments(
        current=current,
        total=total,
        purchase_total_amount=purchase_total,
    )


def _build_installments(raw: Any) -> Optional[OCRInstallments]:
    """Normaliza el bloque `installments` que devuelve Gemini (O2)."""
    if raw is None:
        return None
    if not isinstance(raw, dict):
        return None
    current = _to_float(raw.get("current"))
    total = _to_float(raw.get("total"))
    purchase_total = _to_float(raw.get("purchase_total_amount"))
    if current is None and total is None and purchase_total is None:
        return None
    return OCRInstallments(
        current=int(current) if current is not None else None,
        total=int(total) if total is not None else None,
        purchase_total_amount=purchase_total,
    )


async def _match_category(
    raw_text: Optional[str], records: List[Dict[str, Any]]
) -> Tuple[Optional[str], Optional[str]]:
    """Usa el matcher de categorías del agente B si ya está disponible.

    Devuelve (category_id, category_name). Si el servicio aún no existe o
    falla, degrada a (None, None) sin romper el OCR.
    """
    global _matcher_warning_logged
    if not raw_text or not records:
        return None, None
    try:
        from app.services.categories_service import CategoriesService
        from app.repositories.categories_repository import CategoriesRepository

        matcher = CategoriesService(CategoriesRepository())
        outcome = matcher.match_category(raw_text, records)
        if inspect.isawaitable(outcome):
            outcome = await outcome
        if not outcome:
            return None, None
        if isinstance(outcome, (tuple, list)) and len(outcome) >= 2:
            cat_id, cat_name = outcome[0], outcome[1]
            return (
                str(cat_id) if cat_id else None,
                str(cat_name) if cat_name else None,
            )
        return None, None
    except Exception as exc:
        if _matcher_warning_logged:
            logger.debug(
                "El matcher de categorías sigue sin estar disponible (%s).", exc
            )
        else:
            logger.warning(
                "El matcher de categorías no está disponible (%s). "
                "Se degrada la resolución de category_id.", exc
            )
            _matcher_warning_logged = True
        return None, None


async def _resolve_category(
    raw_category: Optional[str],
    records: List[Dict[str, Any]],
    context_text: Optional[str] = None,
) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """Valida la categoría devuelta por el modelo (O5).

    Devuelve (category, category_id, category_raw):
      - Si la categoría coincide exactamente con la lista → (nombre, id, None).
      - Si no coincide → se conserva el texto crudo en `category_raw` y la
        categoría queda en `null` (nunca se inventan categorías).
      - Si el modelo no devolvió categoría, se intenta el matcher con el texto
        crudo disponible (comercio / nombre del producto).
    """
    raw = str(raw_category).strip() if raw_category is not None else ""

    if not raw:
        if context_text:
            matched_id, matched_name = await _match_category(context_text, records)
            record = _find_record_by_name(matched_name, records)
            if record:
                return record["name"], record.get("id") or matched_id, None
        return None, None, None

    exact = _find_record_by_name(raw, records)
    if exact:
        return exact["name"], exact.get("id"), None

    # Categoría inválida: se intenta mapear con el matcher, si no, queda en null.
    matched_id, matched_name = await _match_category(raw, records)
    record = _find_record_by_name(matched_name, records)
    if record:
        return record["name"], record.get("id") or matched_id, raw

    return None, None, raw


async def _build_items(
    raw_items: Any, records: List[Dict[str, Any]]
) -> List[OCRItemResult]:
    """Construye y valida la lista de productos (O5)."""
    items: List[OCRItemResult] = []
    if not isinstance(raw_items, list):
        return items
    for raw in raw_items:
        if not isinstance(raw, dict):
            continue
        name = str(raw.get("item_name") or raw.get("name") or "").strip()
        if not name:
            continue
        category, category_id, category_raw = await _resolve_category(
            raw.get("category"), records, context_text=name
        )
        quantity = _to_float(raw.get("quantity"))
        items.append(OCRItemResult(
            item_name=name,
            quantity=quantity if quantity is not None else 1.0,
            unit_price=_to_float(raw.get("unit_price")) or 0.0,
            total_price=_to_float(raw.get("total_price")) or 0.0,
            category=category,
            category_id=category_id,
            confidence=(
                None if raw.get("confidence") is None
                else _clamp_confidence(raw.get("confidence"))
            ),
            category_raw=category_raw,
        ))
    return items


async def _build_result_from_gemini_data(
    data: Dict[str, Any], records: List[Dict[str, Any]]
) -> OCRExtractionResult:
    """Normaliza la respuesta cruda de Gemini al contrato de la API."""
    amount = _to_float(data.get("amount"))
    if amount is None:
        amount = _to_float(data.get("total"))

    nature = data.get("nature")
    if nature not in ("Ingreso", "Gasto", "Transferencia"):
        nature = "Gasto"

    merchant_raw = data.get("merchant_raw") or data.get("merchant")
    merchant_raw = str(merchant_raw).strip() if merchant_raw else None
    merchant = _normalize_merchant(merchant_raw) or _normalize_merchant(data.get("merchant"))

    description = data.get("description")
    description = str(description).strip() if description else None

    context_text = " ".join(filter(None, [merchant, description]))
    category, _category_id, category_raw = await _resolve_category(
        data.get("category"), records, context_text=context_text
    )

    confidence_raw = data.get("confidence")
    confidence: Optional[OCRConfidence] = None
    if isinstance(confidence_raw, dict):
        confidence = OCRConfidence(
            amount=confidence_raw.get("amount"),
            date=confidence_raw.get("date"),
            merchant=confidence_raw.get("merchant"),
            total=confidence_raw.get("total"),
        )
    elif confidence_raw is not None:
        confidence = OCRConfidence(amount=confidence_raw)

    return OCRExtractionResult(
        amount=amount,
        date=_normalize_date(data.get("date")),
        description=description,
        category=category,
        nature=nature,
        merchant=merchant,
        merchant_raw=merchant_raw,
        confidence=confidence,
        installments=_build_installments(data.get("installments")),
        items=await _build_items(data.get("items"), records),
        category_raw=category_raw,
        subtotal=_to_float(data.get("subtotal")),
        tax=_to_float(data.get("tax")),
        discount=_to_float(data.get("discount")),
        tip=_to_float(data.get("tip")),
    )


# --------------------------------------------------------------------------- #
# Detección de duplicados (O6)
# --------------------------------------------------------------------------- #
def _same_day(row_date: Any, iso_date: Optional[str]) -> bool:
    if row_date is None or not iso_date:
        return False
    target = str(iso_date)[:10]
    try:
        return row_date.date().isoformat() == target
    except AttributeError:
        return str(row_date)[:10] == target


def _same_amount(row_amount: Any, amount: Optional[float]) -> bool:
    if row_amount is None or amount is None:
        return False
    try:
        return abs(float(row_amount) - float(amount)) < 0.01
    except (TypeError, ValueError):
        return False


async def _find_duplicate(
    family_id: Optional[str],
    image_hash: Optional[str],
    merchant: Optional[str],
    date: Optional[str],
    amount: Optional[float],
) -> Tuple[bool, Optional[str]]:
    """Busca una transacción reciente idéntica (O6).

    Primero intenta comparar por `transactions.image_hash` (columna opcional: si
    todavía no existe, se degrada a la comparación comercio + fecha + monto).
    """
    if not family_id:
        return False, None
    try:
        from app.db.prisma_db import prisma
    except Exception as exc:
        logger.warning("No se pudo consultar la BD para duplicados: %s", exc)
        return False, None

    if image_hash:
        try:
            rows = await prisma.transaction.find_many(
                where={"family_id": family_id, "image_hash": image_hash},
                take=1,
            )
            if rows:
                return True, str(rows[0].id)
        except Exception as exc:
            logger.info("La columna transactions.image_hash aún no está disponible: %s", exc)

    try:
        rows = await prisma.transaction.find_many(
            where={"family_id": family_id}, take=100, order={"date": "desc"}
        )
    except Exception as exc:
        logger.warning("No se pudieron consultar transacciones para duplicados: %s", exc)
        return False, None

    merchant_key = _normalize_key(merchant)
    for row in rows:
        row_merchant = getattr(row, "merchant", None) or getattr(row, "description", "")
        if merchant_key and _normalize_key(row_merchant) != merchant_key:
            continue
        if not merchant_key:
            continue
        if _same_day(getattr(row, "date", None), date) and _same_amount(
            getattr(row, "amount", None), amount
        ):
            return True, str(row.id)
    return False, None


# --------------------------------------------------------------------------- #
# Orquestación
# --------------------------------------------------------------------------- #
async def extract_receipt_data(
    file_bytes: bytes,
    mime_type: str,
    categories: Optional[List[Union[str, Dict[str, Any]]]] = None,
    family_id: Optional[str] = None,
) -> OCRExtractionResult:
    """
    Orchestrates OCR extraction with multi-provider resilience:
    1. Try Gemini (with multi-key rotation and multi-model fallback: 3.5-flash-lite -> 3.8-flash)
    2. If Gemini fails or quota is exhausted, seamlessly fallback to local Tesseract OCR.

    `categories` son las categorías **de la familia del usuario** (nombres o
    registros con id). Nunca se envía la lista global al modelo.
    """
    provider = os.getenv("OCR_PROVIDER", "gemini").lower()
    _names, records = _normalize_categories(categories)

    # La imagen se prepara una sola vez: hash + rasterizado multipágina.
    prepared: Optional[PreparedImage] = None
    try:
        prepared = _prepare_payload(file_bytes, mime_type)
    except Exception as exc:
        logger.warning(f"No se pudo preparar la imagen ({exc}); se continúa con el proveedor.")

    result: Optional[OCRExtractionResult] = None

    if provider == "openai":
        logger.warning(
            "OCR_PROVIDER='openai' no está implementado en esta versión; se usa Tesseract."
        )
        result = await _extract_tesseract(file_bytes, mime_type, records, prepared=prepared)
    elif provider == "tesseract":
        result = await _extract_tesseract(file_bytes, mime_type, records, prepared=prepared)
    else:
        # Default: Gemini with automatic failover to Tesseract
        if init_gemini():
            try:
                gemini_result = await _extract_gemini(
                    file_bytes, mime_type, records, prepared=prepared
                )
                if gemini_result.amount is not None or gemini_result.description:
                    result = gemini_result
            except Exception as e:
                logger.warning(f"All Gemini attempts failed ({e}). Falling back to local Tesseract OCR...")
        else:
            logger.warning("Gemini not configured or unavailable. Using Tesseract OCR directly.")

        if result is None:
            result = await _extract_tesseract(file_bytes, mime_type, records, prepared=prepared)

    if result is None:
        result = OCRExtractionResult(
            amount=None, date=None, description=None, category=None, nature="Gasto"
        )

    if result.image_hash is None and prepared is not None:
        result.image_hash = prepared.image_hash

    try:
        duplicate, duplicate_of = await _find_duplicate(
            family_id, result.image_hash, result.merchant, result.date, result.amount
        )
        result.duplicate = duplicate
        result.duplicate_of = duplicate_of
    except Exception as exc:
        logger.warning(f"No se pudo verificar si el recibo es duplicado: {exc}")

    return result


async def _extract_gemini(
    file_bytes: bytes,
    mime_type: str,
    categories: Optional[List[Union[str, Dict[str, Any]]]] = None,
    prepared: Optional[PreparedImage] = None,
) -> OCRExtractionResult:
    """
    Implementation using Google Gemini via google.genai SDK.
    Supports multi-key pool rotation on 429/quota limits, and model fallback.
    """
    global _gemini_clients, _current_gemini_index
    if not init_gemini() or not _gemini_clients:
        raise ValueError("No valid Gemini API keys configured.")

    names, records = _normalize_categories(categories)
    if prepared is None:
        prepared = _prepare_payload(file_bytes, mime_type)

    image_bytes, detected_mime = prepared.data, prepared.mime

    # Prompt conciso y estructurado. La lista de categorías se inyecta
    # explícitamente para que el modelo NO invente categorías (O5).
    cat_list = ", ".join(names) if names else ", ".join(DEFAULT_CATEGORY_LIST)
    prompt = f"""Analiza este recibo/factura detalladamente y devuelve SOLO este JSON (sin explicaciones):
{{
  "amount": <total final como número, sin símbolos, ej 190400.0>,
  "date": "<YYYY-MM-DDTHH:MM>",
  "description": "<establecimiento + breve resumen>",
  "merchant_raw": "<nombre del comercio TAL COMO APARECE en el recibo>",
  "merchant": "<nombre del comercio normalizado, sin sufijos corporativos (S.A.S., S.A., Ltda, E.U., S.L.)>",
  "category": "<exactamente uno de: {cat_list}, o null>",
  "nature": "Gasto|Ingreso|Transferencia",
  "installments": {{"current": <número de cuota que se paga, ej 2>, "total": <número total de cuotas, ej 3>, "purchase_total_amount": <monto total de la compra>}} | null,
  "subtotal": <subtotal antes de impuestos, o null>,
  "tax": <valor del IVA/impuesto, o null>,
  "discount": <valor del descuento, o null>,
  "tip": <valor de la propina, o null>,
  "confidence": {{"amount": <0 a 1>, "date": <0 a 1>, "merchant": <0 a 1>, "total": <0 a 1>}},
  "items": [
    {{"item_name": "<nombre del producto>", "quantity": <cantidad, ej 1.0>, "unit_price": <precio unitario>, "total_price": <precio total línea>, "category": "<exactamente uno de: {cat_list}, o null>", "confidence": <0 a 1>}}
  ]
}}
Reglas:
- La imagen puede contener VARIAS páginas de la factura concatenadas verticalmente: lee TODAS las páginas antes de responder.
- "amount" es el TOTAL FINAL pagado. Si el pago es a cuotas, "amount" es el valor de la cuota de este mes y "installments.purchase_total_amount" es el total de la compra.
- "category" debe ser EXACTAMENTE uno de la lista indicada o null. Nunca inventes una categoría que no esté en la lista.
- Si no estás seguro de un campo, devuelve null."""

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
                result = await _build_result_from_gemini_data(data, records)
                result.image_hash = prepared.image_hash
                return result

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
                        result = await _build_result_from_gemini_data(data, records)
                        result.image_hash = prepared.image_hash
                        return result
                    except Exception as retry_err:
                        logger.warning(f"Retry also failed: {retry_err}")
                        continue  # Try next model
                # If model not found (404), continue to next model with the same key
                elif "404" in err_str or "not found" in err_str:
                    continue

    raise Exception(f"All Gemini keys/models exhausted. Last error: {last_error}")


async def _extract_easyocr(
    file_bytes: bytes,
    mime_type: str,
    categories: Optional[List[Union[str, Dict[str, Any]]]] = None,
) -> OCRExtractionResult:
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
        return await _process_raw_text(text, categories)
    except Exception as e:
        raise ValueError(f"Error EasyOCR: {str(e)}")


async def _extract_tesseract(
    file_bytes: bytes,
    mime_type: str,
    categories: Optional[List[Union[str, Dict[str, Any]]]] = None,
    prepared: Optional[PreparedImage] = None,
) -> OCRExtractionResult:
    """
    Local Tesseract OCR fallback. Uses pytesseract + Pillow to extract text
    from the image and then delegates field extraction to _process_raw_text.
    This is the last line of defense when cloud providers are unavailable.
    """
    _names, records = _normalize_categories(categories)
    try:
        if prepared is None:
            prepared = _prepare_payload(file_bytes, mime_type)
        image_bytes, detected_mime = prepared.data, prepared.mime

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
            fallback_cat, _cid, _raw = await _resolve_category("Otros", records)
            return OCRExtractionResult(
                amount=None, date=None, description=None,
                category=fallback_cat, nature="Gasto",
                image_hash=prepared.image_hash,
            )

        result = await _process_raw_text(text, records)
        result.image_hash = prepared.image_hash
        return result
    except Exception as e:
        logger.error(f"Tesseract extraction failed: {e}")
        # Return a valid empty result so the frontend can still render the form
        fallback_cat, _cid, _raw = await _resolve_category("Otros", records)
        return OCRExtractionResult(
            amount=None, date=None, description=None,
            category=fallback_cat, nature="Gasto",
            image_hash=prepared.image_hash if prepared else None,
        )


async def _process_raw_text(
    text: str,
    categories: Optional[List[Union[str, Dict[str, Any]]]] = None,
) -> OCRExtractionResult:
    """Extrae los campos de un texto plano (fallback Tesseract)."""
    names, records = _normalize_categories(categories)

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
    amount_score = 0
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
                        # (solo aplica a keywords medias: "total a pagar" es una
                        # señal fuerte aunque la línea anterior sea el IVA)
                        if not is_high_conf:
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
        amount_score = float(all_candidates[0][1])

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
                amount_score = 50  # Solo coincidencia numérica → confianza media

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
    safe_categories = names
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
                    if safe_categories:
                        for db_cat in _any(safe_categories):
                            if str(db_cat).lower() == cat_name.lower():
                                suggested_category = db_cat
                                break
                    else:
                        suggested_category = cat_name
                    break
            if suggested_category != "Otros":
                break

    # 3. Validación: la categoría final SIEMPRE debe existir en la lista de la
    #    familia. Si no existe, queda en null y se conserva el texto crudo.
    category, _category_id, category_raw = await _resolve_category(
        suggested_category, records, context_text=clean_text
    )

    # --- Date ---
    date_keywords = ["fecha expedicion", "fecha de factura", "fecha emision", "fecha", "date", "expedido"]
    date_patterns = [r"(\d{2}[/-]\d{2}[/-]\d{4})", r"(\d{4}[/-]\d{2}[/-]\d{2})", r"(\d{2}[/-]\d{2}[/-]\d{2})"]
    extracted_date = None
    date_confidence = 0.0

    # 1. Try to find date near keywords
    for kw in date_keywords:
        # Construct a pattern that looks for the keyword followed by optional non-digit characters and then any of the date patterns
        # The `|` operator combines the date patterns
        combined_date_pattern = "|".join(date_patterns)
        pattern = rf"{kw}[^\d]*?({combined_date_pattern})"

        match = re.search(pattern, clean_text)
        if match:
            raw_date = match.group(1) # group(1) will capture the matched date string from the combined date_pattern
            for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%d/%m/%y"):
                try:
                    dt = datetime.strptime(raw_date, fmt)
                    extracted_date = dt.strftime("%Y-%m-%dT12:00")
                    date_confidence = 0.8
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
                        date_confidence = 0.5
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

    # --- Description / Comercio (O4) ---
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    description = lines[0] if lines else "Recibo"
    # Safely iterate first 3 lines
    for i, line in enumerate(lines):
        if i >= 3: break
        if len(re.sub(r"[\d\W]", "", line)) > 3:
            description = line
            break

    merchant_raw = description if description != "Recibo" else None
    merchant = _normalize_merchant(merchant_raw)

    # --- Cuotas (O2) ---
    installments = _parse_installments(clean_text)

    # --- Subtotal / IVA / Descuento / Propina (O7) ---
    subtotal = _extract_labeled_amount(clean_text, _SUBTOTAL_LABELS)
    tax = _extract_labeled_amount(clean_text, _TAX_LABELS)
    discount = _extract_labeled_amount(clean_text, _DISCOUNT_LABELS)
    tip = _extract_labeled_amount(clean_text, _TIP_LABELS)

    # --- Confianza (O3) ---
    if amount is None:
        amount_confidence = 0.0
    elif amount_score >= 100:
        amount_confidence = 0.9      # keyword de alta confianza
    else:
        amount_confidence = 0.6      # coincidencia numérica / keyword media
    confidence = OCRConfidence(
        amount=amount_confidence,
        date=date_confidence,
        merchant=0.6 if merchant else 0.0,
        total=amount_confidence,
    )

    logger.debug(
        "OCR (Tesseract) -> amount=%s date=%s category=%s installments=%s",
        amount, extracted_date, category, installments,
    )
    # Using dictionary and model_validate to completely bypass attribute checks in IDE
    data = {
        "amount": amount,
        "date": extracted_date,
        "description": str(description),
        "category": category,
        "category_raw": category_raw,
        "nature": nature,
        "merchant": merchant,
        "merchant_raw": merchant_raw,
        "confidence": confidence,
        "installments": installments,
        "items": [],
        "subtotal": subtotal,
        "tax": tax,
        "discount": discount,
        "tip": tip,
    }
    return OCRExtractionResult.model_validate(data)


# --------------------------------------------------------------------------- #
# Preprocesado de imagen
# --------------------------------------------------------------------------- #
def _fit_image(image: Image.Image) -> Image.Image:
    """Reduce la imagen a MAX_IMAGE_DIM conservando la proporción."""
    if max(image.size) > MAX_IMAGE_DIM:
        image.thumbnail((MAX_IMAGE_DIM, MAX_IMAGE_DIM), Image.Resampling.LANCZOS)
    return image


def _pdf_page_images(file_bytes: bytes, max_pages: int = MAX_PDF_PAGES) -> List[Image.Image]:
    """Renderiza cada página del PDF como imagen (O1).

    Como máximo se leen `max_pages` páginas (control de tokens); si el PDF tiene
    más, se usan las primeras y se registra un warning.
    """
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    try:
        total_pages = doc.page_count
        pages_to_read = min(total_pages, max_pages)
        if total_pages > max_pages:
            logger.warning(
                f"El PDF tiene {total_pages} páginas; solo se procesarán las "
                f"primeras {max_pages} por límite de tokens."
            )
        images: List[Image.Image] = []
        for index in range(pages_to_read):
            try:
                page = doc.load_page(index)
                pix = page.get_pixmap(dpi=150)
                if pix.width == 0 or pix.height == 0:
                    continue
                image = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
                images.append(_fit_image(image))
            except Exception as exc:
                logger.warning(f"No se pudo renderizar la página {index + 1} del PDF: {exc}")
        return images
    finally:
        doc.close()


def _concat_vertical(images: List[Image.Image]) -> Image.Image:
    """Concatena las páginas en una sola imagen vertical."""
    if not images:
        raise ValueError("No hay páginas para concatenar")
    if len(images) == 1:
        return images[0]
    width = max(img.size[0] for img in images)
    height = sum(img.size[1] for img in images)
    canvas = Image.new("RGB", (width, height), "white")
    offset = 0
    for img in images:
        canvas.paste(img, (0, offset))
        offset += img.size[1]
    return canvas


def _prepare_image_full(file_bytes: bytes, mime_type: str) -> Tuple[bytes, str, int]:
    """Preprocesa el archivo y devuelve (bytes_jpeg, mime_type, páginas).

    Los PDFs con varias páginas se concatenan verticalmente en una sola imagen
    (O1): es más barato en tokens que enviar N imágenes y no cambia el
    contrato HTTP.
    """
    if mime_type == "application/pdf":
        try:
            images = _pdf_page_images(file_bytes)
            if not images:
                raise ValueError("El PDF no contiene páginas legibles")
            combined = _concat_vertical(images)
            out_buffer = io.BytesIO()
            combined.save(out_buffer, format="JPEG", quality=JPEG_QUALITY, optimize=True)
            return out_buffer.getvalue(), "image/jpeg", len(images)
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
        image = _fit_image(image)

        out_buffer = io.BytesIO()
        # Quality 75 is visually indistinguishable from 85 for receipts
        # but cuts transfer + Gemini processing time noticeably.
        image.save(out_buffer, format="JPEG", quality=JPEG_QUALITY, optimize=True)
        return out_buffer.getvalue(), "image/jpeg", 1
    except Exception as e:
        logger.warning(f"Image optimization skipped: {e}")
        return file_bytes, mime_type or "image/jpeg", 1


def _prepare_image(file_bytes: bytes, mime_type: str) -> Tuple[bytes, str]:
    """Preprocesa el archivo y devuelve (bytes_jpeg, mime_type)."""
    data, mime, _pages = _prepare_image_full(file_bytes, mime_type)
    return data, mime


def _prepare_payload(file_bytes: bytes, mime_type: str) -> PreparedImage:
    """Preprocesa la imagen y calcula su hash (para duplicados, O6)."""
    data, mime, pages = _prepare_image_full(file_bytes, mime_type)
    return PreparedImage(
        data=data,
        mime=mime,
        image_hash=hashlib.sha256(data).hexdigest(),
        page_count=pages,
    )
