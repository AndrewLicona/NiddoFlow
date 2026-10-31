"""Modelos para corregir la categoría de los productos de una factura.

Viven aparte de `app/models/transaction.py` porque ese archivo es parte del
contrato de creación/edición de movimientos y este es un flujo distinto:
el usuario revisa los productos de una factura ya registrada y ajusta la
categoría de alguno.
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from uuid import UUID


class TransactionItemCategoryUpdate(BaseModel):
    """Corrección de la categoría de un producto.

    `category_id` puede ir en null para dejar el producto sin categoría
    (por ejemplo, cuando el usuario decide que no aplica).
    """
    item_id: UUID
    category_id: Optional[UUID] = None
    category: Optional[str] = Field(default=None, max_length=80)


class TransactionItemsCategoryRequest(BaseModel):
    """Lote de correcciones para una misma factura."""
    items: List[TransactionItemCategoryUpdate] = Field(default_factory=list)


class TransactionItemCategoryResponse(BaseModel):
    id: UUID
    item_name: str
    category_id: Optional[UUID] = None
    category: Optional[str] = None
    updated: bool = False
