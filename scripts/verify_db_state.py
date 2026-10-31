"""Auditoría de SALUD de la base de datos real de Supabase (solo lectura).

Comprueba, contra la base conectada en ``backend/.env``:

  1. Que no queden **artefactos de prueba** (tablas tipo ``_tmp``, ``probe``,
     ``test``, ``backup``) con datos o sin RLS.
  2. Que **todas** las tablas públicas tengan RLS activado.
  3. Que las FKs que apuntan a ``categories`` o ``transactions`` usen
     ``on delete set null`` (nunca cascade), salvo la excepcion documentada de
     las lineas de producto.
  4. Que no haya **referencias huerfanas** (movimientos, deudas o productos
     apuntando a algo que no existe).
  5. Cuantas filas hay en cada tabla (control de datos).

Es de SOLO LECTURA: no modifica nada. Devuelve codigo de salida 1 si detecta
un problema.

Uso:
    .\\backend\\venv\\Scripts\\python.exe scripts\\verify_db_state.py
"""

import asyncio
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND = os.path.join(ROOT, "backend")
sys.path.insert(0, BACKEND)

try:
    from dotenv import load_dotenv

    load_dotenv(os.path.join(BACKEND, ".env"))
except Exception:  # pragma: no cover - dotenv es opcional
    pass

TABLAS = (
    "categories", "transactions", "transaction_items", "budgets", "debts",
    "accounts", "families", "profiles", "user_category_rules",
    "ai_chat_messages", "shopping_items", "savings_goals", "recurring_bills",
)

# Excepcion documentada: las lineas de producto mueren con su factura.
CASCADE_PERMITIDO = {"transaction_items.transaction_id"}

#(config, "col") -> que debe cumplir cada FK
FK_REGLAS = {
    "budgets.category_id": "set null",
    "transactions.category_id": "set null",
    "transaction_items.category_id": "set null",
    "debts.category_id": "set null",
    "shopping_items.category_id": "set null",
    "shopping_items.purchase_transaction_id": "set null",
    "savings_goals.category_id": "set null",
    "recurring_bills.category_id": "set null",
    "categories.parent_id": "set null",
}

ACCIONES = {"a": "no action", "r": "restrict", "c": "cascade", "n": "set null", "d": "set default"}

patrones_basura = ("_tmp%", "tmp_%", "%probe%", "test_%", "%_test", "backup%", "%_old")


def _p(proveedor, consulta):
    return proveedor.query_raw(consulta)


async def main() -> int:
    from prisma import Prisma

    db = Prisma()
    try:
        await db.connect(timeout=20)
    except Exception as exc:
        print(f"[error] no se pudo conectar a la base de datos: {exc}")
        print("        revisa DATABASE_URL en backend/.env")
        return 1

    fallos = []
    try:
        # --- 1. Artefactos de prueba -------------------------------------
        print("=== Artefactos de prueba ===")
        condiciones = " OR ".join(
            f"tablename LIKE '{p}'" for p in patrones_basura
        )
        basura = await _p(
            db,
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND ("
            + condiciones + ") ORDER BY tablename",
        )
        if not basura:
            print("  OK  no hay tablas de prueba abandonadas")
        for fila in basura:
            nombre = fila["tablename"]
            total = await _p(db, f"SELECT count(*)::int AS c FROM public.{nombre}")
            rls = await _p(
                db,
                "SELECT c.relrowsecurity AS rls FROM pg_class c "
                "JOIN pg_namespace n ON n.oid = c.relnamespace "
                f"WHERE n.nspname = 'public' AND c.relname = '{nombre}'",
            )
            tiene_rls = bool(rls and rls[0]["rls"])
            print(f"  AVISO  {nombre}: {total[0]['c']} filas, RLS={'si' if tiene_rls else 'NO'}")
            fallos.append(f"tabla de prueba abandonada: {nombre}")

        # --- 2. RLS completa ----------------------------------------------
        print("\n=== RLS ===")
        sin_rls = await _p(
            db,
            "SELECT c.relname AS nombre FROM pg_class c "
            "JOIN pg_namespace n ON n.oid = c.relnamespace "
            "WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity "
            "ORDER BY c.relname",
        )
        if not sin_rls:
            print("  OK  todas las tablas publicas tienen RLS")
        for fila in sin_rls:
            print(f"  FALLA  {fila['nombre']} sin RLS")
            fallos.append(f"tabla sin RLS: {fila['nombre']}")

        # --- 3. Acciones de las FKs ---------------------------------------
        print("\n=== FKs hacia categories / transactions ===")
        fks = await _p(
            db,
            "SELECT rel.relname AS tabla, con.conname AS conname, con.confdeltype AS acc "
            "FROM pg_constraint con "
            "JOIN pg_class rel ON rel.oid = con.conrelid "
            "JOIN pg_namespace n ON n.oid = rel.relnamespace "
            "WHERE n.nspname = 'public' AND con.contype = 'f' AND ("
            "pg_get_constraintdef(con.oid) LIKE '%REFERENCES categories%' OR "
            "pg_get_constraintdef(con.oid) LIKE '%REFERENCES transactions%') "
            "ORDER BY rel.relname, con.conname",
        )
        for fila in fks:
            tabla = fila["tabla"]
            conname = fila["conname"]
            accion = ACCIONES.get(fila["acc"], fila["acc"])
            columna = conname.replace(f"{tabla}_", "").replace("_fkey", "")
            clave = f"{tabla}.{columna}"
            esperado = FK_REGLAS.get(clave)
            if clave in CASCADE_PERMITIDO:
                print(f"  OK    {clave:46} {accion} (excepcion documentada)")
            elif esperado is None:
                print(f"  --    {clave:46} {accion} (sin regla)")
            elif accion == esperado:
                print(f"  OK    {clave:46} {accion}")
            else:
                print(f"  FALLA  {clave:46} {accion} (se esperaba {esperado})")
                fallos.append(f"FK {clave} con on delete {accion}")

        # --- 4. Referencias huerfanas --------------------------------------
        print("\n=== Integridad de referencias ===")
        huerfanos = (
            (
                "movimientos con categoria inexistente",
                "SELECT count(*)::int AS c FROM transactions t "
                "WHERE t.category_id IS NOT NULL AND NOT EXISTS "
                "(SELECT 1 FROM categories c WHERE c.id = t.category_id)",
            ),
            (
                "deudas con categoria inexistente",
                "SELECT count(*)::int AS c FROM debts d "
                "WHERE d.category_id IS NOT NULL AND NOT EXISTS "
                "(SELECT 1 FROM categories c WHERE c.id = d.category_id)",
            ),
            (
                "productos sin movimiento",
                "SELECT count(*)::int AS c FROM transaction_items i "
                "WHERE NOT EXISTS (SELECT 1 FROM transactions t WHERE t.id = i.transaction_id)",
            ),
            (
                "presupuestos con categoria inexistente",
                "SELECT count(*)::int AS c FROM budgets b "
                "WHERE b.category_id IS NOT NULL AND NOT EXISTS "
                "(SELECT 1 FROM categories c WHERE c.id = b.category_id)",
            ),
        )
        for etiqueta, consulta in huerfanos:
            res = await _p(db, consulta)
            total = res[0]["c"]
            if total:
                print(f"  FALLA  {etiqueta}: {total}")
                fallos.append(f"{etiqueta}: {total}")
            else:
                print(f"  OK    {etiqueta}: 0")

        # --- 5. Conteo de filas -------------------------------------------
        print("\n=== Filas por tabla ===")
        for tabla in TABLAS:
            res = await _p(db, f"SELECT count(*)::int AS c FROM public.{tabla}")
            print(f"  {tabla:22} {res[0]['c']}")
    finally:
        try:
            await db.disconnect()
        except Exception:
            pass

    print("\n" + "=" * 60)
    if fallos:
        print(f"FALLOS: {len(fallos)}")
        for fallo in fallos:
            print(f"  - {fallo}")
        return 1
    print("OK: la base de datos esta sana (sin artefactos, con RLS, FKs seguras).")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
