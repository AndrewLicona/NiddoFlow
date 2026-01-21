from typing import Optional
from app.services.base import BaseService
from app.repositories.categories_repository import CategoriesRepository

class CategoriesService(BaseService):
    def __init__(self, repository: CategoriesRepository):
        super().__init__(repository)

    async def get_categories(self, user_id: str):
        profile_res = self.repository.get_user_profile(user_id)
        family_id = profile_res.data[0].get('family_id') if profile_res.data else None
        
        res = self.repository.get_categories(family_id)
        return res.data or []
