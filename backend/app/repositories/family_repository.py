from typing import Optional
from app.repositories.base import BaseRepository

class FamilyRepository(BaseRepository):
    def get_user_profile(self, user_id: str):
        return self.db.table("profiles").select("*").eq("id", user_id).execute()

    def create_family(self, name: str, invite_code: str):
        return self.db.table("families").insert({"name": name, "invite_code": invite_code}).execute()

    def update_user_family(self, user_id: str, family_id: Optional[str]):
        return self.db.table("profiles").update({"family_id": family_id}).eq("id", user_id).execute()

    def find_family_by_code(self, invite_code: str):
        return self.db.table("families").select("*").eq("invite_code", invite_code).execute()

    def get_family_by_id(self, family_id: str):
        return self.db.table("families").select("*").eq("id", family_id).execute()

    def get_family_members(self, family_id: str):
        return self.db.table("profiles").select("id, full_name, email").eq("family_id", family_id).execute()
