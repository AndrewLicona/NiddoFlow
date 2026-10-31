"""Acceso a datos del importador de movimientos bancarios."""

from typing import List, Optional
from datetime import datetime
from app.repositories.base import BaseRepository


class ImportRepository(BaseRepository):

    async def get_user_profile(self, user_id: str):
        profile = await self.prisma.profile.find_unique(where={"id": user_id})
        return type('obj', (object,), {'data': [profile.dict()] if profile else []})

    async def get_accounts_by_family(self, family_id: str) -> List[dict]:
        res = self.db.table("accounts").select("id, name, type, user_id, balance") \
            .eq("family_id", family_id).execute()
        return res.data or []

    async def get_categories_by_family(self, family_id: str) -> List[dict]:
        """Categorías visibles para la familia: las globales por defecto y las propias."""
        res = self.db.table("categories").select("id, name, type, icon, is_default, family_id") \
            .or_(f"is_default.eq.true,family_id.eq.{family_id}").execute()
        return res.data or []

    async def get_existing_movements(self, family_id: str, since_date: Optional[str]) -> List[dict]:
        """Movimientos ya registrados en la familia, para detectar duplicados.

        Se limita a un rango razonable de fechas: comparar contra el histórico
        completo sería caro y no aporta (un movimiento de hace dos años no
        puede ser el mismo que uno de hoy con el mismo importe).
        """
        query = self.db.table("transactions") \
            .select("id, date, amount, description, merchant, import_hash, type, account_id") \
            .eq("family_id", family_id)
        if since_date:
            query = query.gte("date", since_date)
        res = query.execute()
        return res.data or []

    async def insert_transaction(self, data: dict):
        try:
            created = await self.prisma.transaction.create(data=data, include={"items": True})
            if created:
                return created.dict()
        except Exception:
            pass
        res = self.db.table("transactions").insert(data).execute()
        return (res.data or [None])[0]

    async def get_transaction_by_id(self, tx_id: str) -> Optional[dict]:
        res = self.db.table("transactions").select("*").eq("id", tx_id).limit(1).execute()
        return (res.data or [None])[0]
