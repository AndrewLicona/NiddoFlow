from pydantic import BaseModel
from typing import Optional, Literal
from uuid import UUID
from datetime import datetime

class TransactionBase(BaseModel):
    description: str
    amount: float
    type: Literal['income', 'expense', 'transfer']
    date: datetime
    category_id: Optional[UUID] = None
    account_id: UUID

class TransactionCreate(TransactionBase):
    pass

class TransactionUpdate(BaseModel):
    description: Optional[str] = None
    amount: Optional[float] = None
    type: Optional[Literal['income', 'expense', 'transfer']] = None
    date: Optional[datetime] = None
    category_id: Optional[UUID] = None
    account_id: Optional[UUID] = None

class TransactionResponse(TransactionBase):
    id: UUID
    user_id: Optional[UUID]
    family_id: UUID
    created_at: datetime
    category_name: Optional[str] = None
    account_name: Optional[str] = None
    user_name: Optional[str] = None
