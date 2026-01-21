from app.repositories.base import BaseRepository

class BudgetsRepository(BaseRepository):
    def get_user_profile(self, user_id: str):
        return self.db.table("profiles").select("family_id").eq("id", user_id).execute()

    def get_budgets_by_family(self, family_id: str):
        return self.db.table("budgets").select("*").eq("family_id", family_id).execute()

    def query_budgets(self, filters: dict):
        query = self.db.table("budgets").select("*")
        for key, value in filters.items():
            if value is None:
                query = query.is_(key, "null")
            else:
                query = query.eq(key, value)
        return query.execute()

    def upsert_budget(self, budget_id: str, data: dict):
        if budget_id:
            return self.db.table("budgets").update(data).eq("id", budget_id).execute()
        return self.db.table("budgets").insert(data).execute()

    def delete_budget(self, budget_id: str, family_id: str):
        return self.db.table("budgets").delete().eq("id", budget_id).eq("family_id", family_id).execute()
