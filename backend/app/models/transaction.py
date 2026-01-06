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

class TransactionResponse(TransactionBase):
    id: UUID
    user_id: Optional[UUID]
    family_id: UUID
    created_at: datetime
