from typing import List, Optional
from app.repositories.base import BaseRepository


class GoalsRepository(BaseRepository):
    def get_user_profile(self, user_id: str):
        return self.db.table("profiles").select("family_id").eq("id", user_id).execute()

    def get_goals(self, family_id: str, created_by: Optional[str] = None):
        query = self.db.table("savings_goals").select("*").eq("family_id", family_id)
        if created_by:
            query = query.eq("created_by", created_by)
        return query.order("created_at", desc=True).execute()

    def get_goal_by_id(self, goal_id: str, family_id: str):
        return (
            self.db.table("savings_goals")
            .select("*")
            .eq("id", goal_id)
            .eq("family_id", family_id)
            .execute()
        )

    def insert_goal(self, data: dict):
        return self.db.table("savings_goals").insert(data).execute()

    def update_goal(self, goal_id: str, family_id: str, data: dict):
        return (
            self.db.table("savings_goals")
            .update(data)
            .eq("id", goal_id)
            .eq("family_id", family_id)
            .execute()
        )

    def delete_goal(self, goal_id: str, family_id: str):
        return (
            self.db.table("savings_goals")
            .delete()
            .eq("id", goal_id)
            .eq("family_id", family_id)
            .execute()
        )

    # --- Cuentas y transacciones (para el aporte) ---------------------------

    def get_account_by_id(self, account_id: str, family_id: str):
        return (
            self.db.table("accounts")
            .select("*")
            .eq("id", account_id)
            .eq("family_id", family_id)
            .execute()
        )

    def insert_transaction(self, data: dict):
        return self.db.table("transactions").insert(data).execute()

    def get_category_by_id(self, category_id: str):
        return self.db.table("categories").select("*").eq("id", category_id).execute()

    def get_category_names(self, family_id: str):
        """Mapa id -> nombre de las categorias visibles de la familia."""
        res = self.db.table("categories").select("id, name").or_(
            f"is_default.eq.true,family_id.eq.{family_id}"
        ).execute()
        return {row['id']: row['name'] for row in (res.data or [])}
