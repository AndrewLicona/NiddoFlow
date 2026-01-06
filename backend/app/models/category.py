from pydantic import BaseModel
from typing import Optional, Literal
from uuid import UUID

class CategoryBase(BaseModel):
    name: str
    type: Literal['income', 'expense']
    icon: Optional[str] = None
    is_default: bool = False

class CategoryResponse(CategoryBase):
    id: UUID
    family_id: Optional[UUID]
