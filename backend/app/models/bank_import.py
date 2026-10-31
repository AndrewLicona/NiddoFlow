"""Modelos del importador de movimientos bancarios.

El importador sigue un flujo de dos pasos deliberadamente:

    1. `preview`  -> analiza el archivo y devuelve qué se crearía, SIN escribir nada
    2. `commit`   -> crea únicamente las filas que el usuario confirmó

Nunca se borra nada: si una transacción existente no aparece en el archivo
del banco, se reporta como "posiblemente eliminada en el banco" para revisión
manual, pero jamás se elimina automáticamente.
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Literal


class ImportRow(BaseModel):
    """Una fila del archivo, ya normalizada y con su diagnóstico."""
    row_number: int
    date: Optional[str] = None
    description: Optional[str] = None
    merchant: Optional[str] = None
    amount: Optional[float] = None
    type: Literal['income', 'expense', 'transfer'] = 'expense'
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    account_id: Optional[str] = None
    import_hash: Optional[str] = None
    status: Literal['new', 'duplicate', 'conflict', 'invalid'] = 'new'
    duplicate_of: Optional[str] = None
    duplicate_reason: Optional[str] = None
    selected: bool = True
    warnings: List[str] = Field(default_factory=list)


class ImportPreviewResponse(BaseModel):
    rows: List[ImportRow] = Field(default_factory=list)
    total: int = 0
    new_count: int = 0
    duplicate_count: int = 0
    conflict_count: int = 0
    invalid_count: int = 0
    detected_format: str = "csv"
    accounts: List[dict] = Field(default_factory=list)
    categories: List[dict] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)


class ImportCommitRequest(BaseModel):
    rows: List[ImportRow] = Field(default_factory=list)
    default_account_id: Optional[str] = None
    default_category_id: Optional[str] = None


class ImportCommitResponse(BaseModel):
    created: int = 0
    skipped: int = 0
    transaction_ids: List[str] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)
    missing_in_bank: List[dict] = Field(default_factory=list)
