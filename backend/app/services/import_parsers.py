"""Parsing de archivos bancarios (CSV y OFX/QFX).

Se separó del servicio para poder probarlo sin base de datos ni red: estas
funciones son puras y no tocan Supabase.
"""

import csv
import io
import re
import hashlib
import unicodedata
from typing import Dict, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Detección de columnas
# ---------------------------------------------------------------------------

COLUMN_ALIASES: Dict[str, List[str]] = {
    'date': [
        'fecha', 'fecha transaccion', 'fecha operacion', 'fecha movimiento',
        'fecha de transaccion', 'date', 'transaction date', 'value date',
        'fecha valor', 'posting date',
    ],
    'description': [
        'descripcion', 'concepto', 'detalle', 'narrativo', 'movimiento',
        'description', 'memo', 'detalle del movimiento', 'concepto del movimiento',
    ],
    'amount': [
        'monto', 'valor', 'amount', 'importe', 'valor transaccion', 'monto transaccion',
        'debe', 'credito', 'debito', 'value', 'import',
    ],
    'type': ['tipo', 'type', 'naturaleza', 'movimiento tipo', 'debito credito'],
    'category': ['categoria', 'categoría', 'category', 'subcategoria'],
    'merchant': [
        'comercio', 'merchant', 'establecimiento', 'comercio recibo',
        'comercio establecimiento', 'trade name',
    ],
    'account': ['cuenta', 'account', 'numero cuenta', 'account id', 'cuenta origen'],
    'balance': ['saldo', 'balance', 'saldo actual', 'saldo anterior'],
}

# Palabras que delatan un gasto dentro de una descripción libre.
EXPENSE_HINTS = [
    'compra', 'pago', 'abono', 'transferencia', 'retiro', 'caja', 'consignacion',
    'pago tarjeta', 'pos', 'atm', 'online', 'utilidad',
]
INCOME_HINTS = [
    'nomina', 'salario', 'deposito', 'ingreso', 'transferencia recibida',
    'devolucion', 'reembolso', 'intereses', 'dividendos',
]


def _normalize_header(value: str) -> str:
    """Minúsculas, sin tildes y sin caracteres especiales."""
    if value is None:
        return ''
    text = unicodedata.normalize('NFKD', str(value)).encode('ascii', 'ignore').decode('ascii')
    text = text.strip().lower()
    text = re.sub(r'[^a-z0-9 ]+', ' ', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def detect_columns(headers: List[str]) -> Dict[str, int]:
    """Mapea las cabeceras del CSV a nuestros camposcanónicos.

    Devuelve {campo_canonico: indice}. Un alias exacto gana; si no hay
    coincidencia exacta, se busca una cabecera que *contenga* el alias (más
    largo primero, para que "fecha transaccion" gane sobre "fecha").
    """
    normalized = [_normalize_header(h) for h in headers]
    mapping: Dict[str, int] = {}

    for field, aliases in COLUMN_ALIASES.items():
        # Gana el alias MÁS LARGO que coincida, exacto o como palabra
        # completa dentro de la cabecera: así "Fecha Transaccion" prevails
        # sobre "Fecha", que es un prefijo suyo.
        best_idx = None
        best_len = 0
        for idx, header in enumerate(normalized):
            if not header:
                continue
            for alias in aliases:
                alias_n = _normalize_header(alias)
                if not alias_n:
                    continue
                if header == alias_n or re.search(
                        rf'(^|\s){re.escape(alias_n)}(\s|$)', header):
                    if len(alias_n) > best_len:
                        best_idx = idx
                        best_len = len(alias_n)
            if best_idx is not None:
                mapping[field] = best_idx

    return mapping


# ---------------------------------------------------------------------------
# Normalización de valores
# ---------------------------------------------------------------------------

def parse_amount(raw: object) -> Optional[float]:
    """Convierte un importe a float tolerando formatos colombianos y europeos.

    - "1.234.567,89" -> 1234567.89  (formato colombiano)
    - "1,234,567.89" -> 1234567.89  (formato anglosajón)
    - "$45.000"      -> 45000.0
    - "(45.000)"     -> -45000.0    (contabilidad: paréntesis = negativo)
    - "" / "-"       -> None
    """
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw)

    text = str(raw).strip()
    if not text or text in {'-', '--', 'N/A', 'n/a'}:
        return None

    negative = False
    if text.startswith('(') and text.endswith(')'):
        negative = True
        text = text[1:-1]

    # Quita todo lo que no sea dígito, coma, punto o signo
    text = re.sub(r'[^\d,.\-]', '', text)
    if text.startswith('-'):
        negative = True
        text = text[1:]
    if not text:
        return None

    has_comma = ',' in text
    has_dot = '.'

    if has_comma and has_dot:
        # El separador decimal es el último que aparece
        if text.rfind(',') > text.rfind('.'):
            text = text.replace('.', '').replace(',', '.')
        else:
            text = text.replace(',', '')
    elif has_comma:
        parts = text.split(',')
        if len(parts) == 2 and len(parts[1]) <= 2:
            text = text.replace(',', '.')       # 1234,56 -> decimal
        else:
            text = text.replace(',', '')        # 1,234,567 -> miles
    elif has_dot:
        parts = text.split('.')
        if len(parts) > 2:
            text = text.replace('.', '')        # 1.234.567 -> miles
        elif len(parts) == 2 and len(parts[1]) == 3 and len(parts[0]) <= 3:
            # Ambiguo: "1.234" podría ser 1234 (miles) o 1.234 (decimal).
            # En bancos Colombian el valor con 3 decimales es raro, así que
            # se interpreta como separador de miles.
            text = text.replace('.', '')

    try:
        value = float(text)
    except ValueError:
        return None

    return -value if negative else value


def parse_date(raw: object) -> Optional[str]:
    """Normaliza distintas fechas a ISO `YYYY-MM-DD`."""
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None

    # Formato ISO compacto de OFX: 20260115
    if re.fullmatch(r'\d{8}', text):
        return f"{text[0:4]}-{text[4:6]}-{text[6:8]}"

    # Formato OFX con hora: 20260115120000 (o con zona: 20260115120000[-5:EST])
    if re.match(r'^\d{14}', text):
        base = text[0:14]
        return f"{base[0:4]}-{base[4:6]}-{base[6:8]}"

    # ISO con o sin hora
    iso = re.match(r'^(\d{4})-(\d{1,2})-(\d{1,2})', text)
    if iso:
        return f"{int(iso.group(1)):04d}-{int(iso.group(2)):02d}-{int(iso.group(3)):02d}"

    # dd/mm/yyyy o mm/dd/yyyy
    slash = re.match(r'^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})', text)
    if slash:
        a, b, c = slash.groups()
        a, b = int(a), int(b)
        year = int(c)
        if year < 100:
            year += 2000
        # Si el primer componente es > 12, es día. Si el segundo es > 12, es día.
        if a > 12:
            day, month = a, b
        elif b > 12:
            month, day = a, b
        else:
            day, month = a, b   # convención dd/mm (Colombia)
        try:
            return f"{year:04d}-{month:02d}-{day:02d}"
        except Exception:
            return None

    return None


def infer_type(amount: Optional[float], raw_type: Optional[str], description: Optional[str]) -> str:
    """Deduce si la fila es ingreso o gasto."""
    if raw_type:
        t = _normalize_header(raw_type)
        if t in {'credito', 'crédito', 'credit', 'ingreso', 'income', 'abono', 'deposito'}:
            return 'income'
        if t in {'debito', 'débito', 'debit', 'gasto', 'expense', 'retiro', 'pago'}:
            return 'expense'
        if t in {'transferencia', 'transfer'}:
            return 'transfer'

    if amount is None:
        return 'expense'

    # El signo manda: negativo es salida, positivo es entrada.
    if amount < 0:
        return 'expense'

    desc = _normalize_header(description or '')
    for hint in INCOME_HINTS:
        if hint in desc:
            return 'income'
    for hint in EXPENSE_HINTS:
        if hint in desc:
            return 'expense'

    return 'income' if amount > 0 else 'expense'


def normalize_merchant(description: Optional[str], merchant: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    """Separa el comercio del resto y normaliza su nombre.

    Devuelve (merchant_normalizado, descripcion_original).
    """
    raw = (merchant or description or '').strip()
    if not raw:
        return None, description

    # Quita sufijos corporativos y ruido del pie de recibo.
    cleaned = re.sub(
        r'(?:^|(?<=\s))(s\.?\s?a\.?\s?s\.?|s\.?\s?a\.?|ltda\.?|ltd\.?|e\.?\s?u\.?|s\.?\s?l\.?)(?=$|\s)',
        ' ', raw, flags=re.IGNORECASE
    )
    cleaned = re.sub(r'[^A-Za-z0-9áéíóúñÁÉÍÓÚÑ ]+', ' ', cleaned)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip(' -')

    # Normaliza a Title Case. En nombres de comercios se capitalizan todas
    # las palabras: "La Esmeralda", no "la Esmeralda".
    words = [w for w in cleaned.split(' ') if w]
    titled = [w.capitalize() for w in words]
    normalized = ' '.join(titled).strip()

    return (normalized or None), description


def compute_import_hash(date_iso: Optional[str], amount: Optional[float], merchant: Optional[str]) -> str:
    """Huella estable de un movimiento, para detectar duplicados.

    Deliberadamente NO usa la descripción completa: el mismo movimiento
    cambia de descripción entre extractos del banco ("COMPRA TARJ" vs
    "COMPRA TARJ 4521"). Se apoya en fecha, importe y comercio.
    """
    base = f"{date_iso or ''}|{round(amount, 2) if amount is not None else ''}|{(merchant or '').lower().strip()}"
    return hashlib.sha256(base.encode('utf-8')).hexdigest()[:32]


# ---------------------------------------------------------------------------
# Lectura de archivos
# ---------------------------------------------------------------------------

def parse_csv_content(content: bytes) -> Tuple[List[dict], List[str]]:
    """Lee un CSV y devuelve (filas crudas con claves canónicas, errores)."""
    errors: List[str] = []
    rows: List[dict] = []

    try:
        text = content.decode('utf-8-sig')
    except UnicodeDecodeError:
        try:
            text = content.decode('latin-1')
        except Exception as exc:
            return [], [f"No se pudo decodificar el archivo: {exc}"]

    # Detecta el delimitador
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=',;\t|')
        delimiter = dialect.delimiter
    except Exception:
        delimiter = ';' if sample.count(';') > sample.count(',') else ','

    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    headers = reader.fieldnames or []
    if not headers:
        return [], ["El archivo no tiene cabecera."]

    mapping = detect_columns(headers)
    if 'date' not in mapping or 'amount' not in mapping:
        errors.append(
            "No se pudo detectar la fecha o el importe. "
            f"Cabeceras encontradas: {', '.join(headers)}. "
            "Se esperaban columnas como 'fecha' y 'monto'."
        )
        return [], errors

    for index, raw_row in enumerate(reader, start=2):
        if not any((v or '').strip() for v in raw_row.values()):
            continue
        row = {}
        for field, col_index in mapping.items():
            try:
                row[field] = raw_row[headers[col_index]]
            except Exception:
                row[field] = None
        row['_row_number'] = index
        rows.append(row)

    return rows, errors


OFX_FIELD_MAP = {
    'DTPOSTED': 'date',
    'TRNAMT': 'amount',
    'FITID': 'fitid',
    'NAME': 'merchant',
    'MEMO': 'description',
    'PAYEE': 'merchant',
}


def parse_ofx_content(content: bytes) -> Tuple[List[dict], List[str]]:
    """Lee un OFX/QFX.

    El formato OFX suele venir en dialecto SGML (etiquetas sin cerrar), por
    lo que el parser XML falla. Se usa expresión regular, que además es
    tolerante con la cabecera opcional `<?xml ...?>`.
    """
    errors: List[str] = []
    rows: List[dict] = []

    try:
        text = content.decode('utf-8', errors='replace')
    except Exception as exc:
        return [], [f"No se pudo leer el archivo OFX: {exc}"]

    blocks = re.findall(r'<STMTTRN>(.*?)</STMTTRN>', text, flags=re.IGNORECASE | re.DOTALL)
    if not blocks:
        # Algunos bancos envían el cuerpo sin el bloque STMTTRN agrupado
        blocks = re.findall(r'<TRNTYPE>(.*?)</TRNTYPE>', text, flags=re.IGNORECASE | re.DOTALL)
        if blocks:
            errors.append("Formato OFX no reconocido: se encontró un archivo con transacciones pero sin la estructura esperada.")

    for index, block in enumerate(blocks, start=2):
        row: Dict[str, object] = {}
        for tag, field in OFX_FIELD_MAP.items():
            match = re.search(rf'<{tag}>\s*([^<\r\n]+)', block, flags=re.IGNORECASE)
            if match:
                row[field] = match.group(1).strip()
        if not row:
            continue
        row['_row_number'] = index
        rows.append(row)

    if not rows and not errors:
        errors.append("No se encontraron transacciones en el archivo OFX.")

    return rows, errors
