from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime, date

class BudgetBase(BaseModel):
    category_id: Optional[UUID] = None
    amount: float
    period: str = "monthly"
    month: Optional[int] = None
    week_number: Optional[int] = None
    year: int
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    user_id: Optional[UUID] = None

class BudgetCreate(BudgetBase):
    pass

class BudgetResponse(BudgetBase):
    id: UUID
    family_id: UUID
    created_at: datetime
