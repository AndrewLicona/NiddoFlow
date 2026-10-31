#!/usr/bin/env python3
"""Verificador de las migraciones SQL de NiddoFlow.

Uso:
    python scripts/verify_migrations.py
    python scripts/verify_migrations.py --repo-root C:\\ruta\\a\\NiddoFlow

Qué comprueba (CONTRATOS_IMPLEMENTACION.md §0 y §6):

1. Que ningún ``.sql`` del proyecto contenga DDL destructivo:
   ``DROP TABLE``, ``DROP COLUMN``, ``TRUNCATE``, ``DELETE FROM`` sin
   ``WHERE`` ni ``ALTER COLUMN ... TYPE``.
2. Que ``DROP CONSTRAINT IF EXISTS`` solo se use para el cambio de FK de
   ``budgets`` (§6.3).
3. Que toda tabla creada por un script tenga su
   ``ALTER TABLE ... ENABLE ROW LEVEL SECURITY`` y su política (§6.7).
4. Que ``supabase/migrations/20261030_improvements.sql`` contenga las
   sentencias clave del contrato §6.

Salida: código de salida 0 si todo pasa, 1 si hay algún fallo.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

# --------------------------------------------------------------------------
# Patrones de DDL destructivo (§0.1). Se evalúan sobre el texto ya limpio
# de comentarios, para que las menciones dentro de comentarios no salten.
# --------------------------------------------------------------------------
DESTRUCTIVOS: list[tuple[str, str]] = [
    (r"\bdrop\s+table\b", "DROP TABLE"),
    (r"\bdrop\s+column\b", "DROP COLUMN"),
    (r"\btruncate\b", "TRUNCATE"),
    (r"\balter\s+column\s+\S+\s+type\b", "ALTER COLUMN ... TYPE"),
    (
        r"\balter\s+table\s+\S+\s+alter\s+column\s+\S+\s+type\b",
        "ALTER TABLE ... ALTER COLUMN ... TYPE",
    ),
]

# Sentencias que el contrato §6 exige encontrar en la migración.
# Se comparan sobre el texto normalizado (espacios colapsados).
REQUERIDOS_EN_MIGRACION: list[tuple[str, str]] = [
    # §6.1 · tablas que faltaban en el script de despliegue
    ("create table if not exists transaction_items", "tabla transaction_items"),
    ("create table if not exists user_category_rules", "tabla user_category_rules"),
    ("create table if not exists ai_chat_messages", "tabla ai_chat_messages"),
    # §6.2 · columnas nuevas
    (
        "alter table categories add column if not exists parent_id uuid "
        "references categories(id) on delete set null",
        "categories.parent_id",
    ),
    (
        "create unique index if not exists categories_family_name_type_uniq",
        "índice único de categorías",
    ),
    (
        "coalesce(family_id, '00000000-0000-0000-0000-000000000000'::uuid), "
        "lower(name), type",
        "expresión del índice único de categorías",
    ),
    (
        "alter table transaction_items add column if not exists category_id uuid "
        "references categories(id) on delete set null",
        "transaction_items.category_id",
    ),
    (
        "alter table transaction_items add column if not exists confidence numeric",
        "transaction_items.confidence",
    ),
    ("alter table transactions add column if not exists merchant text", "transactions.merchant"),
    (
        "alter table transactions add column if not exists installment_current integer",
        "transactions.installment_current",
    ),
    (
        "alter table transactions add column if not exists installment_total integer",
        "transactions.installment_total",
    ),
    (
        "alter table transactions add column if not exists purchase_total_amount numeric",
        "transactions.purchase_total_amount",
    ),
    ("alter table transactions add column if not exists image_hash text", "transactions.image_hash"),
    ("alter table transactions add column if not exists import_hash text", "transactions.import_hash"),
    ("alter table transactions add column if not exists source text", "transactions.source"),
    (
        "alter table budgets add column if not exists user_id uuid "
        "references auth.users(id) on delete cascade",
        "budgets.user_id",
    ),
    (
        "alter table transactions add column if not exists receipt_url text",
        "transactions.receipt_url",
    ),
    (
        "alter table transactions add column if not exists target_account_id uuid "
        "references accounts(id) on delete set null",
        "transactions.target_account_id",
    ),
    (
        "alter table recurring_bills add column if not exists notes text",
        "recurring_bills.notes",
    ),
    # §6.2 · índices
    (
        "create index if not exists transactions_family_date_idx on transactions (family_id, date desc)",
        "índice transactions_family_date_idx",
    ),
    (
        "create index if not exists transactions_merchant_idx on transactions (merchant)",
        "índice transactions_merchant_idx",
    ),
    (
        "create index if not exists transaction_items_transaction_idx on transaction_items (transaction_id)",
        "índice transaction_items_transaction_idx",
    ),
    (
        "create index if not exists transaction_items_category_idx on transaction_items (category_id)",
        "índice transaction_items_category_idx",
    ),
    (
        "create index if not exists user_category_rules_lookup_idx "
        "on user_category_rules (user_id, merchant)",
        "índice user_category_rules_lookup_idx",
    ),
    # §6.3 · cambio de FK de budgets
    (
        "alter table budgets drop constraint if exists budgets_category_id_fkey",
        "drop de la FK de budgets",
    ),
    (
        "foreign key (category_id) references categories(id) on delete set null",
        "FK de budgets con ON DELETE SET NULL",
    ),
    # §6.4 · tablas nuevas
    ("create table if not exists shopping_items", "tabla shopping_items"),
    ("create table if not exists savings_goals", "tabla savings_goals"),
    ("create table if not exists recurring_bills", "tabla recurring_bills"),
    (
        "create index if not exists shopping_items_family_status_idx "
        "on shopping_items (family_id, status)",
        "índice shopping_items_family_status_idx",
    ),
    # §6.5 · reglas aprendidas
    (
        "create unique index if not exists user_category_rules_uniq "
        "on user_category_rules (user_id, merchant, raw_keyword)",
        "índice único de reglas aprendidas",
    ),
    # §6.6 · categorías por defecto
    ("('Salud', 'expense', true)", "categoría por defecto Salud"),
    ("('Otros', 'expense', true)", "categoría por defecto Otros"),
    ("('Préstamos Recibidos', 'income', true)", "categoría por defecto Préstamos Recibidos"),
    ("('Préstamos Otorgados', 'expense', true)", "categoría por defecto Préstamos Otorgados"),
    ("('Deudas', 'expense', true)", "categoría por defecto Deudas"),
    # §6.7 · RLS de las tablas nuevas
    ("alter table transaction_items enable row level security", "RLS de transaction_items"),
    ("alter table user_category_rules enable row level security", "RLS de user_category_rules"),
    ("alter table ai_chat_messages enable row level security", "RLS de ai_chat_messages"),
    ("alter table shopping_items enable row level security", "RLS de shopping_items"),
    ("alter table savings_goals enable row level security", "RLS de savings_goals"),
    ("alter table recurring_bills enable row level security", "RLS de recurring_bills"),
    # §6.1 · función del dashboard
    ("create function public.get_dashboard_summary(p_user_id uuid)", "función get_dashboard_summary"),
    ("returns json", "retorno json de get_dashboard_summary"),
    ("'total_balance'", "campo total_balance"),
    ("'monthly_income'", "campo monthly_income"),
    ("'monthly_expense'", "campo monthly_expense"),
    ("'trends'", "campo trends"),
]

RE_CREATE_TABLE = re.compile(
    r"\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?([a-zA-Z_][\w\.\"]*)",
    re.IGNORECASE,
)
RE_ENABLE_RLS = re.compile(
    r"\balter\s+table\s+(?:if\s+exists\s+)?([a-zA-Z_][\w\.\"]*)\s+enable\s+row\s+level\s+security",
    re.IGNORECASE,
)
RE_CREATE_POLICY = re.compile(
    r"\bcreate\s+policy\b[^;]*?\bon\s+([a-zA-Z_][\w\.\"]*)",
    re.IGNORECASE | re.DOTALL,
)
RE_DROP_CONSTRAINT = re.compile(
    r"\bdrop\s+constraint\s+if\s+exists\s+([a-zA-Z_][\w\.\"]*)", re.IGNORECASE
)
RE_DELETE_FROM = re.compile(r"\bdelete\s+from\b", re.IGNORECASE)
RE_DROP_NOT_NULL = re.compile(
    r"\balter\s+column\s+([a-zA-Z_][\w\"]*)\s+drop\s+not\s+null\b", re.IGNORECASE
)

# Unicas FKs que se pueden reemplazar para cambiar su accion `on delete`.
# Cualquier otra FK eliminada es un error: el verificador debe avisar.
CONSTRAINTS_REEMPLAZABLES = {
    "budgets_category_id_fkey",   # CASCADE -> SET NULL (preserva el presupuesto)
    "debts_category_id_fkey",     # NO ACTION -> SET NULL (preserva la deuda)
}


def quitar_comentarios(texto: str) -> str:
    """Elimina comentarios de línea y de bloque (sin tocar literales)."""
    texto = re.sub(r"/\*.*?\*/", " ", texto, flags=re.DOTALL)
    texto = re.sub(r"--[^\n\r]*", " ", texto)
    return texto


def quitar_cuerpos_dollar(texto: str) -> str:
    """Sustituye los cuerpos $$...$$ (y $tag$...$tag$) por espacios.

    Así los DDL internos de funciones y bloques DO no se confunden con
    sentencias de primer nivel, y los literales de los DDL no se falsean.
    """
    return re.sub(r"\$[a-zA-Z_]*\$[\s\S]*?\$[a-zA-Z_]*\$", " ", texto)


def normalizar(texto: str) -> str:
    """Colapsa cualquier secuencia de espacios en un solo espacio."""
    return re.sub(r"\s+", " ", texto)


def dividir_statements(texto: str) -> list[str]:
    """Divide el texto en sentencias terminadas por ';'."""
    return [s.strip() for s in texto.split(";") if s.strip()]


def verificar_destructivos(ruta: Path, texto_limpio: str, fallos: list[str]) -> None:
    """Regla 1 y 2: nada de DDL destructivo."""
    for patron, etiqueta in DESTRUCTIVOS:
        for coincidencia in re.finditer(patron, texto_limpio, re.IGNORECASE):
            contexto = texto_limpio[max(0, coincidencia.start() - 60) : coincidencia.end() + 60]
            fallos.append(
                f"[{ruta.name}] DDL destructivo prohibido ({etiqueta}): ...{contexto.strip()}..."
            )

    for sentencia in dividir_statements(texto_limpio):
        if RE_DELETE_FROM.search(sentencia) and not re.search(r"\bwhere\b", sentencia, re.IGNORECASE):
            fallos.append(
                f"[{ruta.name}] DELETE FROM sin WHERE: {sentencia[:160].strip()}"
            )

    for coincidencia in RE_DROP_CONSTRAINT.finditer(texto_limpio):
        nombre = coincidencia.group(1).strip('"')
        if nombre not in CONSTRAINTS_REEMPLAZABLES:
            fallos.append(
                f"[{ruta.name}] DROP CONSTRAINT no permitido fuera de {CONSTRAINTS_REEMPLAZABLES}: {nombre}"
            )

    # Relajar una columna a NULL solo se permite en `budgets.category_id`:
    # es lo que permite conservar el presupuesto al borrar su categoría.
    for coincidencia in RE_DROP_NOT_NULL.finditer(texto_limpio):
        contexto = normalizar(
            texto_limpio[max(0, coincidencia.start() - 90) : coincidencia.end() + 10]
        )
        if "budgets" not in contexto or "category_id" not in contexto:
            fallos.append(
                f"[{ruta.name}] DROP NOT NULL no permitido fuera de budgets.category_id: "
                f"...{contexto.strip()}..."
            )


def verificar_rls(ruta: Path, texto_limpio: str, fallos: list[str]) -> None:
    """Regla 3: toda tabla creada tiene RLS y política."""
    creadas = {m.group(1).strip('"').lower() for m in RE_CREATE_TABLE.finditer(texto_limpio)}
    con_rls = {m.group(1).strip('"').lower() for m in RE_ENABLE_RLS.finditer(texto_limpio)}
    con_politica = {m.group(1).strip('"').lower() for m in RE_CREATE_POLICY.finditer(texto_limpio)}

    for tabla in sorted(creadas - con_rls):
        fallos.append(f"[{ruta.name}] la tabla '{tabla}' no activa RLS")
    for tabla in sorted(creadas - con_politica):
        fallos.append(f"[{ruta.name}] la tabla '{tabla}' no tiene política RLS")


def verificar_migracion(ruta: Path, fallos: list[str]) -> None:
    """Regla 4: la migración contiene las sentencias clave del contrato §6."""
    normalizado = normalizar(ruta.read_text(encoding="utf-8"))
    for esperado, etiqueta in REQUERIDOS_EN_MIGRACION:
        if normalizar(esperado) not in normalizado:
            fallos.append(f"[{ruta.name}] falta la sentencia clave: {etiqueta} → {esperado}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Verifica las migraciones SQL de NiddoFlow.")
    parser.add_argument(
        "--repo-root",
        default=None,
        help="Raíz del repositorio (por defecto, la carpeta que contiene scripts/).",
    )
    args = parser.parse_args()

    raiz = Path(args.repo_root).resolve() if args.repo_root else Path(__file__).resolve().parent.parent
    schema_sql = raiz / "supabase" / "schema.sql"
    carpeta_migraciones = raiz / "supabase" / "migrations"

    fallos: list[str] = []
    archivos: list[Path] = []

    if schema_sql.is_file():
        archivos.append(schema_sql)
    else:
        fallos.append(f"no se encuentra {schema_sql}")

    if carpeta_migraciones.is_dir():
        archivos.extend(sorted(carpeta_migraciones.glob("*.sql")))
    else:
        fallos.append(f"no se encuentra la carpeta {carpeta_migraciones}")

    if not archivos:
        fallos.append("no hay ningún archivo .sql que verificar")

    for ruta in archivos:
        texto = ruta.read_text(encoding="utf-8")
        limpio = quitar_cuerpos_dollar(quitar_comentarios(texto))
        verificar_destructivos(ruta, limpio, fallos)
        verificar_rls(ruta, limpio, fallos)

    migracion = carpeta_migraciones / "20261030_improvements.sql"
    if migracion.is_file():
        verificar_migracion(migracion, fallos)
    else:
        fallos.append(f"no se encuentra la migración {migracion}")

    print(f"Archivos verificados: {len(archivos)}")
    for ruta in archivos:
        print(f"  - {ruta.relative_to(raiz)}")

    if fallos:
        print(f"\nFALLOS ({len(fallos)}):")
        for fallo in fallos:
            print(f"  x {fallo}")
        return 1

    print("\nOK: sin DDL destructivo, RLS completa y sentencias clave presentes.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
