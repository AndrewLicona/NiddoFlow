"""Acceso a datos de las cuentas por pagar recurrentes."""

from typing import List, Optional
from app.repositories.base import BaseRepository


class RecurringBillsRepository(BaseRepository):

    async def get_user_profile(self, user_id: str):
        profile = await self.prisma.profile.find_unique(where={"id": user_id})
        return type('obj', (object,), {'data': [profile.dict()] if profile else []})

    async def get_bills_by_family(self, family_id: str):
        return self.db.table("recurring_bills") \
            .select("*").eq("family_id", family_id) \
            .order("next_due_date", desc=False).execute()

    async def get_bill_by_id(self, bill_id: str, family_id: str):
        res = self.db.table("recurring_bills").select("*") \
            .eq("id", bill_id).eq("family_id", family_id).limit(1).execute()
        return res.data[0] if res.data else None

    async def get_categories_by_family(self, family_id: str) -> List[dict]:
        res = self.db.table("categories").select("id, name, type") \
            .or_(f"is_default.eq.true,family_id.eq.{family_id}").execute()
        return res.data or []

    async def insert_bill(self, data: dict):
        res = self.db.table("recurring_bills").insert(data).execute()
        return res

    async def update_bill(self, bill_id: str, family_id: str, data: dict):
        res = self.db.table("recurring_bills").update(data) \
            .eq("id", bill_id).eq("family_id", family_id).execute()
        return res

    async def delete_bill(self, bill_id: str, family_id: str):
        return self.db.table("recurring_bills").delete() \
            .eq("id", bill_id).eq("family_id", family_id).execute()
