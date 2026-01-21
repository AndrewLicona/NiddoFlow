from app.repositories.base import BaseRepository

class DebtsRepository(BaseRepository):
    def get_user_profile(self, user_id: str):
        return self.db.table("profiles").select("family_id").eq("id", user_id).execute()

    def get_debts_by_family(self, family_id: str):
        return self.db.table("debts").select("*").eq("family_id", family_id).order("created_at", desc=True).execute()

    def insert_debt(self, data: dict):
        return self.db.table("debts").insert(data).execute()

    def update_debt(self, debt_id: str, family_id: str, data: dict):
        return self.db.table("debts").update(data).eq("id", debt_id).eq("family_id", family_id).execute()

    def delete_debt(self, debt_id: str, family_id: str):
        return self.db.table("debts").delete().eq("id", debt_id).eq("family_id", family_id).execute()

    def get_debt_by_id(self, debt_id: str, family_id: str):
        return self.db.table("debts").select("*").eq("id", debt_id).eq("family_id", family_id).execute()

    def get_default_category(self, name: str):
        return self.db.table("categories").select("id").eq("name", name).eq("is_default", True).execute()

    def insert_transaction(self, data: dict):
        return self.db.table("transactions").insert(data).execute()

    def get_account_balance(self, account_id: str):
        return self.db.table("accounts").select("balance").eq("id", account_id).execute()

    def update_account_balance(self, account_id: str, new_balance: float):
        return self.db.table("accounts").update({"balance": new_balance}).eq("id", account_id).execute()
