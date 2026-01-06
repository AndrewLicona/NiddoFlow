from pydantic import BaseModel, UUID4, EmailStr
from typing import Optional

class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None

class UserCreate(UserBase):
    pass

class UserResponse(UserBase):
    id: UUID4
    family_id: Optional[UUID4] = None

    class Config:
        from_attributes = True
