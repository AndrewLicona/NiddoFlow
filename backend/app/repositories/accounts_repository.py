from typing import List, Optional
from app.repositories.base import BaseRepository

class AccountsRepository(BaseRepository):
    def get_user_profile(self, user_id: str):
        return self.db.table("profiles").select("family_id").eq("id", user_id).execute()

    def get_accounts_by_family(self, family_id: str):
        return self.db.table("accounts").select("*").eq("family_id", family_id).execute()

    def get_accounts_by_user(self, user_id: str):
        return self.db.table("accounts").select("*").eq("user_id", user_id).execute()

    def create_account(self, data: dict):
        return self.db.table("accounts").insert(data).execute()

    def create_transaction(self, tx_data: dict):
        return self.db.table("transactions").insert(tx_data).execute()
