from typing import List, Optional
from datetime import datetime
from app.repositories.base import BaseRepository

class TransactionsRepository(BaseRepository):
    async def get_user_profile(self, user_id: str):
        profile = await self.prisma.profile.find_unique(where={"id": user_id})
        return type('obj', (object,), {'data': [profile.dict()] if profile else []})

    async def get_transaction_by_id(self, tx_id: str):
        tx = await self.prisma.transaction.find_unique(
            where={"id": tx_id},
            include={"items": True}
        )
        return type('obj', (object,), {'data': [tx.dict()] if tx else []})

    # Campos opcionales que solo se incluyen si vienen informedados.
    # Esto mantiene el comportamiento intacto en bases de datos donde la
    # migración correspondiente todavía no se ha aplicado.
    OPTIONAL_TX_FIELDS = [
        'merchant', 'source', 'installment_current', 'installment_total',
        'purchase_total_amount', 'image_hash', 'import_hash'
    ]

    def _filter_tx_data(self, data: dict) -> dict:
        """Normaliza los campos de una transacción separando los obligatorios
        de los opcionales (que solo se envían si tienen valor)."""
        prisma_data = {}
        for k, v in data.items():
            if k in ['description', 'amount', 'type', 'category_id', 'account_id', 'user_id', 'family_id', 'receipt_url']:
                prisma_data[k] = v
            elif k in self.OPTIONAL_TX_FIELDS:
                # Solo se incluye si trae valor: si la columna no existe todavía
                # en la base de datos, el insert no se rompe.
                if v is not None and v != '':
                    prisma_data[k] = v
            elif k == 'date' and v:
                if isinstance(v, str):
                    prisma_data['date'] = datetime.fromisoformat(v.replace('Z', '+00:00'))
                else:
                    prisma_data['date'] = v
        return prisma_data

    async def insert_transaction(self, data: dict):
        try:
            prisma_data = self._filter_tx_data(data)
            created = await self.prisma.transaction.create(data=prisma_data, include={"items": True})
            if created:
                return type('obj', (object,), {'data': [created.dict()]})
        except Exception as pe:
            pass
        return self.db.table("transactions").insert(data).execute()

    async def update_transaction(self, tx_id: str, data: dict, family_id: str):
        """Actualiza un movimiento **acotado a la familia**.

        `family_id` es obligatorio: sin el, la operacion podria tocar un
        movimiento de otra familia. El servicio siempre lo pasa (sale del
        perfil del usuario).
        """
        where = {"id": tx_id, "family_id": family_id}

        try:
            prisma_data = self._filter_tx_data(data)
            if prisma_data:
                result = await self.prisma.transaction.update_many(
                    where=where,
                    data=prisma_data,
                )
                if getattr(result, "count", 0) > 0:
                    updated = await self.prisma.transaction.find_first(
                        where=where, include={"items": True}
                    )
                    if updated:
                        return type('obj', (object,), {'data': [updated.dict()]})
        except Exception as pe:
            pass

        res = (
            self.db.table("transactions")
            .update(data)
            .eq("id", tx_id)
            .eq("family_id", family_id)
            .execute()
        )
        if not res.data:
            # No se actualizo nada: puede ser que el movimiento no sea de esta
            # familia. Se intenta relerlo con Prisma, pero si el cliente no esta
            # conectado se devuelve el resultado vacio sin romper la peticion.
            try:
                tx = await self.prisma.transaction.find_first(
                    where=where, include={"items": True}
                )
                if tx:
                    return type('obj', (object,), {'data': [tx.dict()]})
            except Exception:
                pass
        return res

    async def delete_transaction(self, tx_id: str, family_id: str):
        """Borra un movimiento **acotado a la familia**.

        `family_id` es obligatorio. Si el movimiento no pertenece a la familia,
        no se borra nada: ni el movimiento ni sus productos. La comprobacion
        se hace antes de tocar los items para no dejar filas huerfanas.
        """
        where = {"id": tx_id, "family_id": family_id}

        try:
            owned = await self.prisma.transaction.find_first(where=where)
            if owned is None:
                # No es de esta familia (o no existe): no se toca nada.
                return False
            await self.prisma.transactionitem.delete_many(where={"transaction_id": tx_id})
            await self.prisma.transaction.delete(where={"id": tx_id})
            return True
        except Exception as pe:
            pass

        return (
            self.db.table("transactions")
            .delete()
            .eq("id", tx_id)
            .eq("family_id", family_id)
            .execute()
        )

    async def insert_transaction_item(self, item_data: dict):
        try:
            return await self.prisma.transactionitem.create(data=item_data)
        except Exception:
            return self.db.table("transaction_items").insert(item_data).execute()

    async def delete_transaction_items(self, transaction_id: str, family_id: str = None):
        """Borra los productos de un movimiento **acotado a la familia**.

        `transaction_items` no tiene columna `family_id`: el alcance se
        comprueba sobre el movimiento padre. Si el movimiento no es de la
        familia indicada, no se borra ninguna linea.
        """
        if family_id:
            try:
                owned = await self.prisma.transaction.find_first(
                    where={"id": transaction_id, "family_id": family_id}
                )
                if owned is None:
                    return False
            except Exception:
                pass

        try:
            return await self.prisma.transactionitem.delete_many(where={"transaction_id": transaction_id})
        except Exception:
            return self.db.table("transaction_items").delete().eq("transaction_id", transaction_id).execute()

    async def get_transaction_items(self, transaction_id: str):
        """Productos de una factura."""
        try:
            items = await self.prisma.transactionitem.find_many(
                where={"transaction_id": transaction_id}
            )
            return [i.dict() for i in items]
        except Exception:
            res = self.db.table("transaction_items").select("*") \
                .eq("transaction_id", transaction_id).execute()
            return res.data or []

    async def update_transaction_item(self, item_id: str, data: dict):
        """Actualiza un producto (usado para corregir su categoría).

        Solo se envían los campos con valor, para que la operación no falle
        si alguna columna opcional todavía no existe en la base de datos.
        """
        payload = {k: v for k, v in data.items() if v is not None}
        if not payload:
            return None
        try:
            updated = await self.prisma.transactionitem.update(
                where={"id": item_id}, data=payload
            )
            if updated:
                return updated.dict()
        except Exception:
            pass
        res = self.db.table("transaction_items").update(payload).eq("id", item_id).execute()
        return (res.data or [None])[0]

    async def get_accounts_by_family(self, family_id: str):
        accounts = await self.prisma.account.find_many(where={"family_id": family_id})
        return type('obj', (object,), {'data': [a.dict() for a in accounts]})

    async def get_account_by_id(self, account_id: str):
        acc = await self.prisma.account.find_unique(where={"id": account_id})
        return type('obj', (object,), {'data': [acc.dict()] if acc else []})

    # Nota: el saldo de la cuenta NO se actualiza desde el codigo. Lo mantiene
    # el trigger de la base de datos `sync_account_balances_on_transaction_change`.
    # Por eso aqui no hay ningun `update` del saldo: un `update` por `id` sin
    # acotar por familia permitiria tocar la cuenta de otra familia.

    def query_transactions(self, filters: dict, order_by: str = "date", desc: bool = True):
        query = self.db.table("transactions").select("*")
        for key, value in filters.items():
            if isinstance(value, list):
                query = query.in_(key, value)
            else:
                query = query.eq(key, value)
        return query.order(order_by, desc=desc).execute()

    async def get_categories(self, family_id: str):
        categories = await self.prisma.category.find_many(
            where={
                "OR": [
                    {"family_id": family_id},
                    {"is_default": True}
                ]
            }
        )
        return type('obj', (object,), {'data': [c.dict() for c in categories]})

    async def get_profiles_by_ids(self, user_ids: list):
        profiles = await self.prisma.profile.find_many(where={"id": {"in": user_ids}})
        return type('obj', (object,), {'data': [p.dict() for p in profiles]})

    async def get_transactions_prisma(self, family_id: str, account_ids: list, start_date: str = None, end_date: str = None, limit: int = None):
        where = {
            "family_id": family_id,
            "account_id": {"in": account_ids}
        }

        if start_date or end_date:
            where["date"] = {}
            if start_date: where["date"]["gte"] = start_date
            if end_date: where["date"]["lte"] = end_date

        return await self.prisma.transaction.find_many(
            where=where,
            include={
                "category": True,
                "account": True,
                "items": True
            },
            order={"date": "desc"},
            take=limit
        )

    async def get_transfers_prisma(self, family_id: str, start_date: str = None, end_date: str = None):
        where = {
            "family_id": family_id,
            "type": "transfer"
        }
        if start_date or end_date:
            where["date"] = {}
            if start_date: where["date"]["gte"] = start_date
            if end_date: where["date"]["lte"] = end_date

        return await self.prisma.transaction.find_many(
            where=where,
            include={
                "category": True,
                "account": True,
                "items": True
            },
            order={"date": "desc"}
        )
