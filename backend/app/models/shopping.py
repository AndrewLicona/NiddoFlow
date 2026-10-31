from pydantic import BaseModel, Field
from typing import Optional, Literal
from uuid import UUID
from datetime import datetime

# `priority` y `status` replican los CHECK de la tabla `shopping_items`
# (CONTRATOS_IMPLEMENTACION.md 6.4).
ShoppingPriority = Literal['low', 'normal', 'high']
ShoppingStatus = Literal['pending', 'purchased', 'skipped']

class ShoppingItemBase(BaseModel):
    name: str
    category_id: Optional[UUID] = None
    quantity: float = 1.0
    estimated_price: Optional[float] = None
    priority: ShoppingPriority = 'normal'
    notes: Optional[str] = None

class ShoppingItemCreate(ShoppingItemBase):
    pass

class ShoppingItemUpdate(BaseModel):
    """Campos editables de una necesidad. `family_id` NUNCA es editable."""
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    category_id: Optional[UUID] = None
    quantity: Optional[float] = None
    estimated_price: Optional[float] = None
    priority: Optional[ShoppingPriority] = None
    status: Optional[ShoppingStatus] = None
    notes: Optional[str] = None

class ShoppingItemResponse(ShoppingItemBase):
    id: UUID
    family_id: UUID
    status: ShoppingStatus
    purchase_transaction_id: Optional[UUID] = None
    created_by: Optional[UUID] = None
    created_at: datetime
    purchased_at: Optional[datetime] = None
    category_name: Optional[str] = None

class ShoppingPurchaseRequest(BaseModel):
    """Payload de POST /shopping/{id}/purchase."""
    account_id: UUID
    amount: Optional[float] = None
    date: Optional[datetime] = None
    description: Optional[str] = None
