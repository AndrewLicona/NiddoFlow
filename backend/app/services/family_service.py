import random
import string
from typing import List, Optional
from app.services.base import BaseService
from app.repositories.family_repository import FamilyRepository

class FamilyService(BaseService):
    def __init__(self, repository: FamilyRepository):
        super().__init__(repository)

    def _generate_invite_code(self):
        return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

    async def create_family(self, user_id: str, name: str):
        for _ in range(3):
            code = self._generate_invite_code()
            try:
                res = self.repository.create_family(name, code)
                if res.data:
                    new_family = res.data[0]
                    self.repository.update_user_family(user_id, new_family['id'])
                    return new_family
            except Exception:
                continue
        raise Exception("Failed to generate unique invite code")

    async def join_family(self, user_id: str, invite_code: str):
        res = self.repository.find_family_by_code(invite_code)
        if not res.data:
            raise Exception("Invalid invite code")
        
        family = res.data[0]
        self.repository.update_user_family(user_id, family['id'])
        return family

    async def leave_family(self, user_id: str):
        self.repository.update_user_family(user_id, None)
        return True

    async def get_family_members(self, user_id: str):
        profile_res = self.repository.get_user_profile(user_id)
        if not profile_res.data:
            return []
        
        family_id = profile_res.data[0].get('family_id')
        if not family_id:
            return []

        res = self.repository.get_family_members(family_id)
        return res.data or []

    async def get_my_family(self, user_id: str):
        profile_res = self.repository.get_user_profile(user_id)
        if not profile_res.data:
            return []
        
        family_id = profile_res.data[0].get('family_id')
        if not family_id:
            return []

        res = self.repository.get_family_by_id(family_id)
        return res.data or []
