from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID
from datetime import date, datetime

class GoalBase(BaseModel):
    name: str
    target_amount: float
    target_date: Optional[date] = None
    category_id: Optional[UUID] = None

class GoalCreate(GoalBase):
    pass

class GoalUpdate(BaseModel):
    """Campos editables de una meta. `family_id` NUNCA es editable."""
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    target_amount: Optional[float] = None
    saved_amount: Optional[float] = None
    target_date: Optional[date] = None
    category_id: Optional[UUID] = None

class GoalResponse(GoalBase):
    id: UUID
    family_id: UUID
    saved_amount: float
    created_by: Optional[UUID] = None
    created_at: datetime
    category_name: Optional[str] = None
    # Porcentaje de avance calculado por el servidor (0-100).
    progress_pct: float = 0.0

class GoalContributionRequest(BaseModel):
    """Payload de POST /goals/{id}/contribute."""
    amount: float = Field(gt=0)
    account_id: UUID
