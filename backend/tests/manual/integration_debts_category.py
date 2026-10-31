"""Verifica que borrar una categoria NO bloquea y NO pierde las deudas.

Escenario: una deuda apunta a una categoria propia de la familia. Al borrar
esa categoria, la deuda debe SOBREVIVIR con `category_id = NULL` (no 409, no
perdida). Lo mismo con los movimientos, los presupuestos y los productos.

Opt-in obligatorio: `NIDDOFLOW_ALLOW_DB_TESTS=1`.
"""

import asyncio
import os
import sys
from datetime import datetime, timezone

BACKEND = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, BACKEND)

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(BACKEND, ".env"))

# Este script toca la BASE DE DATOS REAL: crea y borra filas de prueba.
# Para evitar borrados accidentales, exige un opt-in explicito.
if os.environ.get("NIDDOFLOW_ALLOW_DB_TESTS") != "1":
    print("No se ejecuta: este script modifica la base de datos real.")
    print("Para ejecutarlo de forma consciente:")
    print("    $env:NIDDOFLOW_ALLOW_DB_TESTS = '1'")
    sys.exit(2)

from app.repositories.base import BaseRepository  # noqa: E402
from app.repositories.categories_repository import CategoriesRepository  # noqa: E402
from app.services.categories_service import CategoriesService  # noqa: E402

USER_A = "f5788158-ab53-40df-b86b-f9bc36e96c76"
FAMILY_A = "0a3561f0-9607-41e8-8d41-5c1b22cf0d16"

ok = fail = 0


def check(nombre, condicion, extra=""):
    global ok, fail
    if condicion:
        ok += 1
        print(f"  PASS  {nombre}")
    else:
        fail += 1
        print(f"  FAIL  {nombre} {extra}")


async def main() -> int:
    db = BaseRepository().db
    service = CategoriesService(CategoriesRepository())

    # Categoria temporal propia de la familia.
    cat_res = db.table("categories").insert({
        "name": "TMP Deuda Sin Bloqueo",
        "type": "expense",
        "is_default": False,
        "family_id": FAMILY_A,
    }).execute()
    category_id = cat_res.data[0]["id"]
    print(f"  (categoria de prueba: {category_id})")

    debt_id = None
    try:
        # Deuda que apunta a la categoria.
        debt_res = db.table("debts").insert({
            "family_id": FAMILY_A,
            "description": "TMP deuda con categoria",
            "total_amount": 100000,
            "remaining_amount": 100000,
            "type": "to_pay",
            "status": "active",
            "category_id": category_id,
            "due_date": datetime.now(timezone.utc).isoformat(),
        }).execute()
        debt_id = debt_res.data[0]["id"]
        check("la deuda se creo con categoria", bool(debt_id))

        # Impacto: el servicio debe ver la deuda.
        try:
            impacto = await service.get_category_impact(USER_A, category_id)
            check("el impacto ve la deuda", impacto["counts"]["debts"] >= 1,
                  f"-> {impacto['counts']}")
            check("el impacto lista la deuda", len(impacto["debts"]) >= 1)
            check("el impacto lista los movimientos", "transactions" in impacto)
        except Exception as exc:
            check("el impacto ve la deuda", False, f"-> {type(exc).__name__}: {exc}")

        # Borrar la categoria NO debe fallar por la deuda.
        try:
            resultado = await service.delete_category(USER_A, category_id)
            check("borrar la categoria no se bloquea", resultado.get("deleted") is True,
                  f"-> {resultado}")
            avisos = resultado.get("warnings", {})
            check("las advertencias informan las deudas", "debts_affected" in avisos,
                  f"-> {avisos}")
        except Exception as exc:
            check("borrar la categoria no se bloquea", False,
                  f"-> {type(exc).__name__}: {exc}")

        # La deuda debe sobrevivir, sin categoria.
        deuda = db.table("debts").select("id, description, category_id").eq("id", debt_id).execute()
        check("la deuda sobrevive al borrado", bool(deuda.data), f"-> {deuda.data}")
        if deuda.data:
            check("la deuda queda sin categoria", deuda.data[0]["category_id"] is None,
                  f"-> {deuda.data[0]['category_id']}")
    finally:
        # Limpieza: solo lo que creo este script.
        if debt_id:
            db.table("debts").delete().eq("id", debt_id).execute()
        db.table("categories").delete().eq("id", category_id).execute()

    print(f"\n== RESULTADO: {ok} OK, {fail} FALLOS ==")
    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
