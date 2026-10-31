"""Modelos de las cuentas por pagar recurrentes del hogar.

Es la parte "hogar" de la gestión de dinero: el arriendo, la luz, el
seguro, la universidad. Son Compromisos con fecha de cobro, distintos de
las `debts` (que son deudas con personas).
"""

from pydantic import BaseModel
from typing import Optional, List, Literal
from uuid import UUID
from datetime import date, datetime

Cadence = Literal['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']


class RecurringBillBase(BaseModel):
    name: str
    amount: float
    cadence: Cadence = 'monthly'
    day_of_month: Optional[int] = None
    next_due_date: Optional[date] = None
    category_id: Optional[UUID] = None
    is_active: bool = True
    notes: Optional[str] = None


class RecurringBillCreate(RecurringBillBase):
    pass


class RecurringBillUpdate(BaseModel):
    name: Optional[str] = None
    amount: Optional[float] = None
    cadence: Optional[Cadence] = None
    day_of_month: Optional[int] = None
    next_due_date: Optional[date] = None
    category_id: Optional[UUID] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class RecurringBillResponse(RecurringBillBase):
    id: UUID
    family_id: UUID
    created_by: Optional[UUID]
    created_at: datetime
    category_name: Optional[str] = None
    # Calculados por el servidor
    days_until_due: Optional[int] = None
    monthly_equivalent: float = 0.0
    is_overdue: bool = False


class RecurringBillsSummary(BaseModel):
    bills: List[RecurringBillResponse] = []
    total_monthly: float = 0.0
    due_next_7_days: List[RecurringBillResponse] = []
    overdue: List[RecurringBillResponse] = []
