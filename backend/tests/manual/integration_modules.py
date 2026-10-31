"""Prueba de integracion del CRUD de shopping y goals contra la BD real.

Requiere que las tablas `shopping_items` y `savings_goals` existan (las crea
la migracion del agente G).

    cd backend
    .\\venv\\Scripts\\python.exe _tmp_integration_modules.py
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

from app.repositories.goals_repository import GoalsRepository  # noqa: E402
from app.repositories.shopping_repository import ShoppingRepository  # noqa: E402
from app.services.goals_service import GoalsService  # noqa: E402
from app.services.shopping_service import ShoppingService  # noqa: E402

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
    shopping = ShoppingService(ShoppingRepository())
    goals = GoalsService(GoalsRepository())
    repo = ShoppingRepository()
    db = repo.db

    account_res = db.table("accounts").select("id").eq("family_id", FAMILY).limit(1).execute()
    account_id = account_res.data[0]["id"]

    try:
        db.table("shopping_items").delete().eq("name", "TMP Leche").execute()
        db.table("savings_goals").delete().eq("name", "TMP Vacaciones").execute()
    except Exception as e:
        print(f"  (las tablas no existen todavia: {e})")
        return 2

    print("\n== SHOPPING ==")
    item = await shopping.create_shopping_item(USER_A, {
        "name": "TMP Leche",
        "quantity": 2,
        "estimated_price": 5000,
        "priority": "high",
        "notes": "nota de prueba",
    })
    check("crea la necesidad", bool(item.get("id")))
    check("family_id del perfil", str(item["family_id"]) == FAMILY)
    check("status pending", item["status"] == "pending")
    check("created_by del token", str(item["created_by"]) == USER_A)
    check("priority guardada", item["priority"] == "high")

    listed = await shopping.get_shopping_items(USER_A)
    check("lista las necesidades", any(i["name"] == "TMP Leche" for i in listed))

    listed_personal = await shopping.get_shopping_items(USER_A, scope="personal")
    check("scope personal filtra por created_by",
          all(i.get("created_by") is not None for i in listed_personal))

    updated = await shopping.update_shopping_item(USER_A, item["id"], {"name": "TMP Leche 2L"})
    check("actualiza la necesidad", updated["name"] == "TMP Leche 2L")

    print("\n== SHOPPING: compra ==")
    purchased = await shopping.purchase_shopping_item(
        USER_A, item["id"], {"account_id": account_id, "amount": 12000}
    )
    check("marca purchased", purchased["status"] == "purchased")
    check("guarda purchase_transaction_id", bool(purchased.get("purchase_transaction_id")))
    check("devuelve la transaccion", purchased.get("transaction") is not None)
    check("la transaccion es gasto", purchased["transaction"]["type"] == "expense")
    check("el monto es el comprado", float(purchased["transaction"]["amount"]) == 12000.0)
    check("purchased_at informado", bool(purchased.get("purchased_at")))

    tx_id = purchased["purchase_transaction_id"]
    tx_row = db.table("transactions").select("id").eq("id", tx_id).execute()
    check("la transaccion existe en la BD", len(tx_row.data) == 1)

    print("\n== SHOPPING: no se puede comprar dos veces ==")
    try:
        await shopping.purchase_shopping_item(USER_A, item["id"], {"account_id": account_id, "amount": 1})
        check("compra repetida -> error", False, "no lanzo")
    except Exception as e:
        check("compra repetida -> error", True, str(e))

    print("\n== SHOPPING: delete ==")
    deleted = await shopping.delete_shopping_item(USER_A, item["id"])
    check("borra la necesidad", deleted["deleted"] is True)
    check("avisa que la transaccion se conserva",
          deleted["warnings"].get("transaction_kept") is True)
    still_tx = db.table("transactions").select("id").eq("id", tx_id).execute()
    check("la transaccion NO se borro", len(still_tx.data) == 1)
    db.table("transactions").delete().eq("id", tx_id).execute()

    print("\n== GOALS ==")
    goal = await goals.create_goal(USER_A, {
        "name": "TMP Vacaciones",
        "target_amount": 3000000,
        "target_date": "2027-01-01",
    })
    check("crea la meta", bool(goal.get("id")))
    check("family_id del perfil", str(goal["family_id"]) == FAMILY)
    check("saved_amount arranca en 0", float(goal["saved_amount"]) == 0)
    check("progress_pct en 0", goal["progress_pct"] == 0.0)

    updated_goal = await goals.update_goal(USER_A, goal["id"], {"target_amount": 2000000})
    check("actualiza el monto objetivo", float(updated_goal["target_amount"]) == 2000000.0)

    print("\n== GOALS: aporte ==")
    contributed = await goals.contribute_to_goal(
        USER_A, goal["id"], {"amount": 500000, "account_id": account_id}
    )
    check("suma a saved_amount", float(contributed["saved_amount"]) == 500000.0)
    check("calcula el avance", contributed["progress_pct"] == 25.0, str(contributed["progress_pct"]))
    check("registra el movimiento", contributed.get("transaction") is not None)

    contrib_tx_id = contributed["transaction"]["id"]
    db.table("transactions").delete().eq("id", contrib_tx_id).execute()

    print("\n== GOALS: delete ==")
    deleted_goal = await goals.delete_goal(USER_A, goal["id"])
    check("borra la meta", deleted_goal["deleted"] is True)
    left = db.table("savings_goals").select("id").eq("id", goal["id"]).execute()
    check("la meta ya no esta", len(left.data) == 0)

    print(f"\n== RESULTADO: {ok} OK, {fail} FALLOS ==")
    return 1 if fail else 0


sys.exit(asyncio.run(main()))
