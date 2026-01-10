from pydantic import BaseModel
from typing import Optional, Literal
from uuid import UUID
from datetime import date, datetime

class DebtBase(BaseModel):
    description: str
    total_amount: float
    remaining_amount: float
    type: Literal['to_pay', 'to_receive']
    status: Literal['active', 'paid'] = 'active'
    category_id: Optional[UUID] = None
    account_id: Optional[UUID] = None
    due_date: Optional[date] = None

class DebtCreate(DebtBase):
    account_id: Optional[UUID] = None

class DebtResponse(DebtBase):
    id: UUID
    family_id: UUID
    created_at: datetime
