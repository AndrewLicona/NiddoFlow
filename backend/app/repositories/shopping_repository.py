from typing import List, Optional
from app.repositories.base import BaseRepository


class ShoppingRepository(BaseRepository):
    def get_user_profile(self, user_id: str):
        return self.db.table("profiles").select("family_id").eq("id", user_id).execute()

    def get_shopping_items(self, family_id: str, status: Optional[str] = None, created_by: Optional[str] = None):
        query = self.db.table("shopping_items").select("*").eq("family_id", family_id)
        if status:
            query = query.eq("status", status)
        if created_by:
            query = query.eq("created_by", created_by)
        return query.order("created_at", desc=True).execute()

    def get_shopping_item_by_id(self, item_id: str, family_id: str):
        return (
            self.db.table("shopping_items")
            .select("*")
            .eq("id", item_id)
            .eq("family_id", family_id)
            .execute()
        )

    def insert_shopping_item(self, data: dict):
        return self.db.table("shopping_items").insert(data).execute()

    def update_shopping_item(self, item_id: str, family_id: str, data: dict):
        return (
            self.db.table("shopping_items")
            .update(data)
            .eq("id", item_id)
            .eq("family_id", family_id)
            .execute()
        )

    def delete_shopping_item(self, item_id: str, family_id: str):
        return (
            self.db.table("shopping_items")
            .delete()
            .eq("id", item_id)
            .eq("family_id", family_id)
            .execute()
        )

    # --- Cuentas y transacciones (para la compra) ---------------------------

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
