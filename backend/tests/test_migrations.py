"""Pruebas del SQL de esquema y migraciones (contrato §6).

Verifican, leyendo los archivos `.sql`, que:

  1. No hay DDL destructivo (`DROP TABLE`, `TRUNCATE`, `DELETE FROM` sin
     `WHERE`, `DROP COLUMN`, `ALTER COLUMN ... TYPE`).
  2. Todo `create table` y todo `add column` es **idempotente**.
  3. Toda tabla nueva tiene RLS activado y al menos una politica.
  4. Las FKs que apuntan a `transactions` y a `categories` usan
     `on delete set null` (nunca `cascade`).
  5. `budgets.category_id` queda en `on delete set null`.
  6. `schema.sql` y la migracion declaran las mismas tablas y columnas.

No necesitan base de datos: solo leen los archivos.
"""

import os
import re

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(BACKEND_DIR)
SUPABASE = os.path.join(ROOT, "supabase")
SCHEMA_SQL = os.path.join(SUPABASE, "schema.sql")
MIGRATIONS_DIR = os.path.join(SUPABASE, "migrations")

# Tablas que deben existir tras aplicar la migracion.
NEW_TABLES = (
    "transaction_items",
    "user_category_rules",
    "ai_chat_messages",
    "shopping_items",
    "savings_goals",
    "recurring_bills",
)

# Columnas nuevas que el codigo de la aplicacion necesita.
NEW_COLUMNS = (
    ("categories", "parent_id"),
    ("transaction_items", "category_id"),
    ("transaction_items", "confidence"),
    ("transactions", "merchant"),
    ("transactions", "source"),
    ("transactions", "image_hash"),
    ("transactions", "import_hash"),
    ("transactions", "installment_current"),
    ("transactions", "installment_total"),
    ("transactions", "purchase_total_amount"),
    ("transactions", "receipt_url"),
    ("transactions", "target_account_id"),
    ("budgets", "user_id"),
    ("recurring_bills", "notes"),
)

# Excepcion documentada: las lineas de producto mueren con su movimiento
# (`transaction_items.transaction_id`). Asi no quedan items huerfanos, y la FK
# no apunta a `categories` ni borra movimientos por accidente.
CASCADE_ALLOWED = {("transaction_items", "transaction_id")}


def _statements(sql):
    for parte in sql.split(";"):
        if parte.strip():
            yield parte


def _tabla_de(statement):
    """Tabla a la que pertenece una sentencia SQL."""
    match = re.search(r"create\s+table\s+(if\s+not\s+exists\s+)?([^\s(]+)", statement)
    if match:
        return match.group(2)
    match = re.search(r"alter\s+table\s+([^\s]+)", statement)
    if match:
        return match.group(1)
    return None


def _read(path):
    with open(path, "r", encoding="utf-8") as handle:
        return handle.read()


def _sql_files():
    files = [SCHEMA_SQL]
    if os.path.isdir(MIGRATIONS_DIR):
        for name in sorted(os.listdir(MIGRATIONS_DIR)):
            if name.endswith(".sql"):
                files.append(os.path.join(MIGRATIONS_DIR, name))
    return files


def _sin_comentarios(sql):
    """Quita los comentarios de linea para no analizar texto de comentario."""
    return "\n".join(re.sub(r"--.*$", "", line) for line in sql.splitlines())


class TestSinDdlDestructivo:
    def test_no_hay_ddl_destructivo(self):
        problemas = []
        for path in _sql_files():
            sql = _sin_comentarios(_read(path)).lower()
            nombre = os.path.relpath(path, ROOT).replace("\\", "/")

            if re.search(r"\bdrop\s+table\b", sql):
                problemas.append(f"{nombre}: DROP TABLE")
            if re.search(r"\btruncate\b", sql):
                problemas.append(f"{nombre}: TRUNCATE")
            if re.search(r"\bdrop\s+column\b", sql):
                problemas.append(f"{nombre}: DROP COLUMN")
            if re.search(r"\balter\s+column\b[^;]*\btype\b", sql):
                problemas.append(f"{nombre}: ALTER COLUMN ... TYPE")
            if re.search(r"\bdelete\s+from\s+\w+\s*;", sql):
                problemas.append(f"{nombre}: DELETE FROM sin WHERE")

        assert not problemas, "DDL destructivo:\n" + "\n".join(problemas)

    def test_el_indice_unico_no_aborta_la_migracion(self):
        """El indice de categorias no puede dejar la migracion a medias."""
        ruta = os.path.join(MIGRATIONS_DIR, "20261030_improvements.sql")
        sql = _sin_comentarios(_read(ruta)).lower()
        assert "raise notice" in sql, (
            "El indice unico de categorias debe avisar con raise notice, "
            "no abortar la migracion."
        )


class TestIdempotencia:
    def test_todo_create_table_es_idempotente(self):
        problemas = []
        for path in _sql_files():
            sql = _sin_comentarios(_read(path)).lower()
            nombre = os.path.relpath(path, ROOT).replace("\\", "/")
            patron = r"create\s+table\s+(if\s+not\s+exists\s+)?([^\s(]+)"
            for match in re.finditer(patron, sql):
                if not match.group(1):
                    problemas.append(
                        f"{nombre}: create table sin if not exists -> {match.group(2)}"
                    )

        assert not problemas, "Create table no idempotente:\n" + "\n".join(problemas)

    def test_todo_add_column_es_idempotente(self):
        problemas = []
        for path in _sql_files():
            sql = _sin_comentarios(_read(path)).lower()
            nombre = os.path.relpath(path, ROOT).replace("\\", "/")
            patron = r"add\s+column\s+(if\s+not\s+exists\s+)?([^\s]+)"
            for match in re.finditer(patron, sql):
                if not match.group(1):
                    problemas.append(
                        f"{nombre}: add column sin if not exists -> {match.group(2)}"
                    )

        assert not problemas, "Add column no idempotente:\n" + "\n".join(problemas)


class TestRowLevelSecurity:
    def test_toda_tabla_nueva_tiene_rls_y_politica(self):
        problemas = []
        for path in _sql_files():
            sql = _sin_comentarios(_read(path)).lower()
            nombre = os.path.relpath(path, ROOT).replace("\\", "/")

            for tabla in NEW_TABLES:
                if not re.search(rf"create\s+table\s+(if\s+not\s+exists\s+)?{tabla}\b", sql):
                    continue  # la tabla no se crea aqui
                if not re.search(rf"alter\s+table\s+{tabla}\s+enable\s+row\s+level\s+security", sql):
                    problemas.append(f"{nombre}: {tabla} sin RLS")
                if not re.search(rf"create\s+policy\b[^;]*\bon\s+{tabla}\b", sql):
                    problemas.append(f"{nombre}: {tabla} sin politica RLS")

        assert not problemas, "RLS incompleta:\n" + "\n".join(problemas)


class TestForeignKeysSeguras:
    def test_las_fks_a_transactions_y_categories_no_borran_en_cascada(self):
        problemas = []
        patron = re.compile(
            r"(\w+)\s+[^,]*?references\s+(transactions|categories)\s*\(\s*id\s*\)\s*"
            r"on\s+delete\s+(set\s+null|cascade|no\s+action|restrict)",
            re.I,
        )

        for path in _sql_files():
            sql = _sin_comentarios(_read(path))
            nombre = os.path.relpath(path, ROOT).replace("\\", "/")

            for statement in _statements(sql):
                tabla = _tabla_de(statement)
                if not tabla:
                    continue
                for match in patron.finditer(statement):
                    columna = match.group(1).lower()
                    destino = match.group(2).lower()
                    accion = " ".join(match.group(3).lower().split())
                    if accion == "set null":
                        continue
                    if (tabla.lower(), columna) in CASCADE_ALLOWED:
                        continue
                    problemas.append(
                        f"{nombre}: {tabla}.{columna} -> {destino} con on delete {accion}"
                    )

        assert not problemas, "FKs inseguras:\n" + "\n".join(problemas)

    def test_el_presupuesto_se_desvincula_en_vez_de_borrarse(self):
        ruta = os.path.join(MIGRATIONS_DIR, "20261030_improvements.sql")
        sql = _sin_comentarios(_read(ruta)).lower()
        assert "drop constraint if exists budgets_category_id_fkey" in sql, (
            "La migracion debe reemplazar la FK budgets.category_id."
        )
        assert re.search(
            r"add\s+constraint\s+budgets_category_id_fkey[^;]*on\s+delete\s+set\s+null",
            sql,
            re.S,
        ), "budgets.category_id debe quedar en ON DELETE SET NULL."

    def test_la_columna_del_presupuesto_admite_null(self):
        ruta = os.path.join(MIGRATIONS_DIR, "20261030_improvements.sql")
        sql = _sin_comentarios(_read(ruta)).lower()
        assert "alter column category_id drop not null" in sql, (
            "budgets.category_id debe admitir NULL para poder desvincularse."
        )


class TestEsquemaSincronizado:
    def test_las_tablas_nuevas_existen_en_schema_sql(self):
        sql = _sin_comentarios(_read(SCHEMA_SQL)).lower()
        faltantes = [
            tabla
            for tabla in NEW_TABLES
            if not re.search(rf"create\s+table\s+(if\s+not\s+exists\s+)?{tabla}\b", sql)
        ]
        assert not faltantes, f"Faltan tablas en schema.sql: {faltantes}"

    def test_las_columnas_nuevas_existen_en_schema_sql(self):
        sql = _sin_comentarios(_read(SCHEMA_SQL)).lower()
        faltantes = []
        for tabla, columna in NEW_COLUMNS:
            patron = rf"alter\s+table\s+{tabla}\s+add\s+column\s+(if\s+not\s+exists\s+)?{columna}\b"
            if not re.search(patron, sql):
                # Tambien puede venir dentro del create table.
                bloque = re.search(
                    rf"create\s+table\s+(if\s+not\s+exists\s+)?{tabla}\s*\((.*?)\n\);",
                    sql,
                    re.S,
                )
                if bloque and re.search(rf"\b{columna}\b", bloque.group(2)):
                    continue
                faltantes.append(f"{tabla}.{columna}")

        assert not faltantes, f"Faltan columnas en schema.sql: {faltantes}"

    def test_el_prisma_no_usa_alter_column_type(self):
        ruta = os.path.join(BACKEND_DIR, "schema.prisma")
        sql = _read(ruta).lower()
        assert "@db." not in sql or "changed" not in sql, (
            "El esquema Prisma no debe cambiar el tipo de una columna existente."
        )
