from pydantic import BaseModel, UUID4
from typing import Optional
from enum import Enum

class AccountType(str, Enum):
    PERSONAL = "personal"
    JOINT = "joint"

class AccountBase(BaseModel):
    name: str
    type: AccountType
    balance: float = 0.0

class AccountCreate(AccountBase):
    family_id: Optional[UUID4] = None
    user_id: Optional[UUID4] = None

class AccountResponse(AccountBase):
    id: UUID4
    family_id: UUID4
    user_id: Optional[UUID4]

    class Config:
        from_attributes = True
