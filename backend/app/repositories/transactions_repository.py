from typing import List, Optional
from app.repositories.base import BaseRepository

class TransactionsRepository(BaseRepository):
    def get_user_profile(self, user_id: str):
        return self.db.table("profiles").select("family_id").eq("id", user_id).execute()

    def get_transaction_by_id(self, tx_id: str):
        return self.db.table("transactions").select("*").eq("id", tx_id).execute()

    def insert_transaction(self, data: dict):
        return self.db.table("transactions").insert(data).execute()

    def update_transaction(self, tx_id: str, data: dict):
        return self.db.table("transactions").update(data).eq("id", tx_id).execute()

    def delete_transaction(self, tx_id: str):
        return self.db.table("transactions").delete().eq("id", tx_id).execute()

    def get_accounts_by_family(self, family_id: str):
        return self.db.table("accounts").select("id, user_id, balance").eq("family_id", family_id).execute()

    def get_account_by_id(self, account_id: str):
        return self.db.table("accounts").select("balance").eq("id", account_id).execute()

    def update_account_balance(self, account_id: str, new_balance: float):
        return self.db.table("accounts").update({"balance": new_balance}).eq("id", account_id).execute()

    def query_transactions(self, filters: dict, order_by: str = "date", desc: bool = True):
        query = self.db.table("transactions").select("*")
        for key, value in filters.items():
            if isinstance(value, list):
                query = query.in_(key, value)
            else:
                query = query.eq(key, value)
        return query.order(order_by, desc=desc).execute()

    def get_categories(self, family_id: str):
        return self.db.table("categories").select("id, name").or_(f"family_id.eq.{family_id},is_default.eq.true").execute()

    def get_profiles_by_ids(self, user_ids: list):
        return self.db.table("profiles").select("id, full_name").in_("id", user_ids).execute()
