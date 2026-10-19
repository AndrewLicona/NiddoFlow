from pydantic import BaseModel
from typing import Optional, Literal, List
from uuid import UUID
from datetime import datetime

class TransactionItemBase(BaseModel):
    item_name: str
    quantity: float = 1.0
    unit_price: float
    total_price: float
    category: Optional[str] = None

class TransactionItemCreate(TransactionItemBase):
    pass

class TransactionItemResponse(TransactionItemBase):
    id: UUID
    transaction_id: UUID
    created_at: datetime

    class Config:
        from_attributes = True

class TransactionBase(BaseModel):
    description: str
    amount: float
    type: Literal['income', 'expense', 'transfer']
    date: datetime
    category_id: Optional[UUID] = None
    account_id: UUID
    receipt_url: Optional[str] = None

class TransactionCreate(TransactionBase):
    target_account_id: Optional[UUID] = None
    items: Optional[List[TransactionItemCreate]] = []

class TransactionUpdate(BaseModel):
    description: Optional[str] = None
    amount: Optional[float] = None
    type: Optional[Literal['income', 'expense', 'transfer']] = None
    date: Optional[datetime] = None
    category_id: Optional[UUID] = None
    account_id: Optional[UUID] = None
    receipt_url: Optional[str] = None
    target_account_id: Optional[UUID] = None
    items: Optional[List[TransactionItemCreate]] = None

class TransactionResponse(TransactionBase):
    id: UUID
    user_id: Optional[UUID]
    family_id: UUID
    created_at: datetime
    category_name: Optional[str] = None
    account_name: Optional[str] = None
    user_name: Optional[str] = None
    target_account_id: Optional[UUID] = None
    items: Optional[List[TransactionItemResponse]] = []
