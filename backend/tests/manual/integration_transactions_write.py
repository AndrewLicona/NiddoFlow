"""Verifica la escritura de movimientos contra la BD real (update y delete).

Comprueba que el repositorio acota las operaciones a la familia:
un movimiento de otra familia NO se puede actualizar ni borrar, y al borrar
el propio se borran tambien sus productos (sin dejar filas huerfanas).

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

from app.db.prisma_db import connect_prisma, disconnect_prisma  # noqa: E402
from app.repositories.base import BaseRepository  # noqa: E402
from app.repositories.transactions_repository import TransactionsRepository  # noqa: E402

USER_A = "f5788158-ab53-40df-b86b-f9bc36e96c76"
FAMILY_A = "0a3561f0-9607-41e8-8d41-5c1b22cf0d16"
FAMILY_B = "11111111-2222-3333-4444-555555555555"  # familia ajena

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
    await connect_prisma()
    db = BaseRepository().db
    repo = TransactionsRepository()

    acc_res = db.table("accounts").select("id").eq("family_id", FAMILY_A).limit(1).execute()
    if not acc_res.data:
        print("  SKIP  la familia de prueba no tiene cuentas")
        return 0
    account_id = acc_res.data[0]["id"]

    tx_id = None
    try:
        tx_res = db.table("transactions").insert({
            "family_id": FAMILY_A,
            "account_id": account_id,
            "type": "expense",
            "amount": 12.5,
            "description": "TEST update/delete de movimientos",
            "date": datetime.now(timezone.utc).isoformat(),
            "user_id": USER_A,
        }).execute()
        tx_id = tx_res.data[0]["id"]
        db.table("transaction_items").insert({
            "transaction_id": tx_id,
            "item_name": "Producto de prueba",
            "quantity": 1,
            "unit_price": 12.5,
            "total_price": 12.5,
        }).execute()

        # --- UPDATE con la familia correcta --------------------------------
        res = await repo.update_transaction(tx_id, {"description": "TEST actualizado"}, FAMILY_A)
        check("update con la familia correcta devuelve la fila",
              bool(res.data) and res.data[0].get("description") == "TEST actualizado",
              f"-> {res.data}")

        # --- UPDATE con otra familia: no debe tocar nada -------------------
        res_otro = await repo.update_transaction(tx_id, {"description": "NO DEBE"}, FAMILY_B)
        actual = db.table("transactions").select("description").eq("id", tx_id).execute()
        check("update con otra familia no modifica el movimiento",
              actual.data and actual.data[0]["description"] == "TEST actualizado",
              f"-> {actual.data}")

        # --- DELETE con otra familia: no debe borrar nada ------------------
        await repo.delete_transaction(tx_id, FAMILY_B)
        sigue = db.table("transactions").select("id").eq("id", tx_id).execute()
        check("delete con otra familia no borra el movimiento", bool(sigue.data))

        # --- DELETE con la familia correcta --------------------------------
        await repo.delete_transaction(tx_id, FAMILY_A)
        borrado = db.table("transactions").select("id").eq("id", tx_id).execute()
        check("delete con la familia correcta borra el movimiento", not borrado.data)

        items = db.table("transaction_items").select("id").eq("transaction_id", tx_id).execute()
        check("los productos se borran con el movimiento (sin huerfanos)", not items.data)
    finally:
        # Limpieza por si algo quedo colgado.
        if tx_id:
            db.table("transaction_items").delete().eq("transaction_id", tx_id).execute()
            db.table("transactions").delete().eq("id", tx_id).eq("family_id", FAMILY_A).execute()
        await disconnect_prisma()

    print(f"\n== RESULTADO: {ok} OK, {fail} FALLOS ==")
    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
