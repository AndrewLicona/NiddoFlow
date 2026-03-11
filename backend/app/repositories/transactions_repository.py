from typing import List, Optional
from app.repositories.base import BaseRepository

class TransactionsRepository(BaseRepository):
    async def get_user_profile(self, user_id: str):
        # Use Prisma for async/speed
        profile = await self.prisma.profile.find_unique(where={"id": user_id})
        # Mocking Supabase response structure for compatibility
        return type('obj', (object,), {'data': [profile.dict()] if profile else []})

    async def get_transaction_by_id(self, tx_id: str):
        tx = await self.prisma.transaction.find_unique(where={"id": tx_id})
        return type('obj', (object,), {'data': [tx.dict()] if tx else []})

    def insert_transaction(self, data: dict):
        return self.db.table("transactions").insert(data).execute()

    def update_transaction(self, tx_id: str, data: dict):
        return self.db.table("transactions").update(data).eq("id", tx_id).execute()

    def delete_transaction(self, tx_id: str):
        return self.db.table("transactions").delete().eq("id", tx_id).execute()

    async def get_accounts_by_family(self, family_id: str):
        accounts = await self.prisma.account.find_many(where={"family_id": family_id})
        return type('obj', (object,), {'data': [a.dict() for a in accounts]})

    async def get_account_by_id(self, account_id: str):
        acc = await self.prisma.account.find_unique(where={"id": account_id})
        return type('obj', (object,), {'data': [acc.dict()] if acc else []})

    async def update_account_balance(self, account_id: str, new_balance: float):
        await self.prisma.account.update(where={"id": account_id}, data={"balance": new_balance})
        return True

    def query_transactions(self, filters: dict, order_by: str = "date", desc: bool = True):
        query = self.db.table("transactions").select("*")
        for key, value in filters.items():
            if isinstance(value, list):
                query = query.in_(key, value)
            else:
                query = query.eq(key, value)
        return query.order(order_by, desc=desc).execute()

    async def get_categories(self, family_id: str):
        # Use Prisma to fetch default or family specific categories
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
                "account": True
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
                "account": True
            },
            order={"date": "desc"}
        )
