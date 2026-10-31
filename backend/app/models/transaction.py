from pydantic import BaseModel, Field
from typing import Optional, Literal, List
from uuid import UUID
from datetime import datetime

class TransactionItemBase(BaseModel):
    item_name: str
    quantity: float = 1.0
    unit_price: float
    total_price: float
    category: Optional[str] = None
    # Categoría real resuelta por el matcher + confianza del OCR.
    # Ambos son opcionales: el texto `category` sigue siendo válido por sí solo.
    category_id: Optional[UUID] = None
    confidence: Optional[float] = None

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
    # Comercio normalizado (del OCR). Opcional para no romper clientes actuales.
    merchant: Optional[str] = None
    # Origen del movimiento: 'manual' | 'ocr' | 'import'.
    source: Optional[str] = None
    # Cuotas: número de cuota actual y total de cuotas.
    installment_current: Optional[int] = None
    installment_total: Optional[int] = None
    # Total de la compra cuando se pagó a cuotas.
    purchase_total_amount: Optional[float] = None
    # Hash perceptual de la imagen del recibo (detección de duplicados).
    image_hash: Optional[str] = None
    # Hash para detectar duplicados del importador bancario.
    import_hash: Optional[str] = None

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
    merchant: Optional[str] = None
    source: Optional[str] = None
    installment_current: Optional[int] = None
    installment_total: Optional[int] = None
    purchase_total_amount: Optional[float] = None
    image_hash: Optional[str] = None
    import_hash: Optional[str] = None

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
