"""Verifica persist_item_categories contra la BD real (columna category_id ya existe).

Simula lo que hara transactions_service tras insertar los items:
inserta una transaccion + items con el TEXTO de la categoria y comprueba que
`persist_item_categories` resuelve y escribe `category_id` (+ `confidence`).
"""
import asyncio
import os
import sys
from datetime import datetime, timezone

BACKEND = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, BACKEND)
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

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
from app.services.categories_service import persist_item_categories  # noqa: E402

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

    cat_res = db.table("categories").select("id, name").eq("name", "Comida").limit(1).execute()
    comida_id = cat_res.data[0]["id"] if cat_res.data else None
    check("existe la categoria Comida", comida_id is not None)

    acc_res = db.table("accounts").select("id").eq("family_id", FAMILY_A).limit(1).execute()
    account_id = acc_res.data[0]["id"] if acc_res.data else None
    check("existe una cuenta de la familia", account_id is not None)

    tx_id = None
    try:
        tx_res = db.table("transactions").insert({
            "family_id": FAMILY_A,
            "account_id": account_id,
            "type": "expense",
            "amount": 25.5,
            "description": "TEST persist_item_categories",
            "date": datetime.now(timezone.utc).isoformat(),
            "user_id": USER_A,
        }).execute()
        tx_id = tx_res.data[0]["id"]

        items = [
            {"item_name": "Leche", "quantity": 1, "unit_price": 1.5, "total_price": 1.5, "category": "Comida"},
            {"item_name": "Pan", "quantity": 2, "unit_price": 2.0, "total_price": 4.0, "category": "Alimentación"},
            {"item_name": "Aceite", "quantity": 1, "unit_price": 20.0, "total_price": 20.0, "category": "xyz-no-existe"},
            {"item_name": "Cafe", "quantity": 1, "unit_price": 3.0, "total_price": 3.0,
             "category": "Comida", "category_id": comida_id, "confidence": 0.9},
        ]
        db.table("transaction_items").insert([{
            "transaction_id": tx_id,
            "item_name": it["item_name"],
            "quantity": it["quantity"],
            "unit_price": it["unit_price"],
            "total_price": it["total_price"],
            "category": it["category"],
        } for it in items]).execute()

        res = db.table("transaction_items").select(
            "item_name, category, category_id, confidence"
        ).eq("transaction_id", tx_id).execute()
        check("los items se insertaron", len(res.data or []) == 4, str(res.data))

        antes = {r["item_name"]: r for r in res.data}
        check("antes de persistir no hay category_id",
              all(r["category_id"] is None for r in res.data))

        await persist_item_categories(tx_id, items)

        res2 = db.table("transaction_items").select(
            "item_name, category, category_id, confidence"
        ).eq("transaction_id", tx_id).execute()
        despues = {r["item_name"]: r for r in res2.data}

        check("'Leche' resolvio a la categoria Comida",
              despues["Leche"]["category_id"] == comida_id,
              str(despues["Leche"]))
        check("'Pan' (alias Alimentación) resolvio a la categoria Comida",
              despues["Pan"]["category_id"] == comida_id,
              str(despues["Pan"]))
        check("el item sin categoria conocida queda en NULL",
              despues["Aceite"]["category_id"] is None,
              str(despues["Aceite"]))
        check("la confianza que trae el item se guarda",
              despues["Cafe"]["confidence"] is not None
              and abs(float(despues["Cafe"]["confidence"]) - 0.9) < 0.001,
              str(despues["Cafe"]))
        check("la categoria_id que trae el item se respeta",
              despues["Cafe"]["category_id"] == comida_id,
              str(despues["Cafe"]))
        check("sin confianza del OCR la columna queda en NULL",
              despues["Leche"]["confidence"] is None,
              str(despues["Leche"]))
        check("el texto de la categoria se conserva",
              despues["Leche"]["category"] == "Comida")
    finally:
        if tx_id:
            db.table("transaction_items").delete().eq("transaction_id", tx_id).execute()
            db.table("transactions").delete().eq("id", tx_id).execute()
            print("  (limpieza hecha)")

    print(f"\n== RESULTADO: {ok} OK, {fail} FALLOS ==")
    return 1 if fail else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
