from typing import Optional
from app.repositories.base import BaseRepository

class CategoriesRepository(BaseRepository):
    def get_user_profile(self, user_id: str):
        return self.db.table("profiles").select("family_id").eq("id", user_id).execute()

    def get_categories(self, family_id: Optional[str] = None):
        query = self.db.table("categories").select("*")
        if family_id:
            query = query.or_(f"is_default.eq.true,family_id.eq.{family_id}")
        else:
            query = query.eq("is_default", True)
        return query.execute()
