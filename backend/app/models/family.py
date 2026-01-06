from pydantic import BaseModel, UUID4
from typing import List, Optional

class FamilyBase(BaseModel):
    name: str

class FamilyCreate(FamilyBase):
    pass

class FamilyResponse(FamilyBase):
    id: UUID4
    invite_code: Optional[str] = None
    # members: List[UserResponse] = [] # Circular import risk, handle later

    class Config:
        from_attributes = True
