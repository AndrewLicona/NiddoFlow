"""Verifica que DELETE /categories/{id} NO borra historial.

Crea una categoria propia, le engancha un presupuesto y un movimiento, la
borra y comprueba que el presupuesto y el movimiento siguen existiendo
(con category_id = NULL).

    cd backend
    .\\venv\\Scripts\\python.exe _tmp_integration_delete_history.py
"""

import asyncio
import os
import sys

BACKEND = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, BACKEND)

from dotenv import load_dotenv

load_dotenv(os.path.join(BACKEND, ".env"))

# Este script toca la BASE DE DATOS REAL: crea y borra filas de prueba.
# Para evitar borrados accidentales, exige un opt-in explicito.
if os.environ.get("NIDDOFLOW_ALLOW_DB_TESTS") != "1":
    print("No se ejecuta: este script modifica la base de datos real.")
    print("Para ejecutarlo de forma consciente:")
    print("    $env:NIDDOFLOW_ALLOW_DB_TESTS = '1'")
    sys.exit(2)

from app.repositories.categories_repository import CategoriesRepository  # noqa: E402
from app.services.categories_service import CategoriesService, CategoryServiceError  # noqa: E402

USER_A = "f5788158-ab53-40df-b86b-f9bc36e96c76"
FAMILY = "0a3561f0-9607-41e8-8d41-5c1b22cf0d16"

ok = 0
fail = 0


def check(label, condition, detail=""):
    global ok, fail
    if condition:
        ok += 1
        print(f"  PASS  {label}")
    else:
        fail += 1
        print(f"  FAIL  {label}  {detail}")


async def main():
    service = CategoriesService(CategoriesRepository())
    repo = CategoriesRepository()
    db = repo.db

    db.table("categories").delete().eq("name", "Tmp Historial").execute()

    cat = await service.create_category(
        USER_A, {"name": "Tmp Historial", "type": "expense", "icon": "Receipt"}
    )
    cat_id = cat["id"]
    check("categoria creada", bool(cat_id))

    # Un movimiento que apunta a la categoria.
    account_res = db.table("accounts").select("id").eq("family_id", FAMILY).limit(1).execute()
    account_id = account_res.data[0]["id"]
    tx_res = db.table("transactions").insert({
        "family_id": FAMILY,
        "user_id": USER_A,
        "account_id": account_id,
        "category_id": cat_id,
        "description": "TMP movimiento de prueba",
        "amount": 12345,
        "type": "expense",
        "date": "2026-10-30T12:00:00",
    }).execute()
    tx_id = tx_res.data[0]["id"]
    check("movimiento creado", bool(tx_id))

    # Un presupuesto que apunta a la categoria.
    budget_created = False
    try:
        budget_res = db.table("budgets").insert({
            "category_id": cat_id,
            "family_id": FAMILY,
            "amount": 100000,
            "period": "monthly",
            "month": 10,
            "year": 2026,
        }).execute()
        budget_id = budget_res.data[0]["id"]
        budget_created = True
        check("presupuesto creado", bool(budget_id))
    except Exception as e:
        print(f"  (presupuesto no creado: {e})")

    result = await service.delete_category(USER_A, cat_id)
    check("borrado ok", result["deleted"] is True)
    print(f"  warnings: {result['warnings']}")

    # El movimiento sigue existiendo.
    tx_after = db.table("transactions").select("id, category_id").eq("id", tx_id).execute()
    check("el movimiento NO se borro", len(tx_after.data) == 1, str(tx_after.data))
    check("el movimiento quedo sin categoria", tx_after.data[0]["category_id"] is None)

    if budget_created:
        budget_after = db.table("budgets").select("id, category_id").eq("id", budget_id).execute()
        check("el presupuesto NO se borro", len(budget_after.data) == 1, str(budget_after.data))
        check("el presupuesto quedo sin categoria", budget_after.data[0]["category_id"] is None)
        db.table("budgets").delete().eq("id", budget_id).execute()

    db.table("transactions").delete().eq("id", tx_id).execute()
    db.table("categories").delete().eq("name", "Tmp Historial").execute()

    print(f"\n== RESULTADO: {ok} OK, {fail} FALLOS ==")
    return 1 if fail else 0


sys.exit(asyncio.run(main()))
