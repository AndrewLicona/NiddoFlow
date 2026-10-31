from pydantic import BaseModel, Field
from typing import List, Literal, Optional
from uuid import UUID

# Tipos permitidos. Los budgets y el dashboard asumen solo estos dos valores
# (CONTRATOS_IMPLEMENTACION.md 3.1): no se agrega un tercer tipo.
CategoryType = Literal['income', 'expense']

class CategoryBase(BaseModel):
    name: str
    type: Literal['income', 'expense']
    icon: Optional[str] = None
    is_default: bool = False

class CategoryResponse(CategoryBase):
    id: UUID
    family_id: Optional[UUID]

class CategoryCreate(BaseModel):
    """Payload de POST /categories/.

    NO acepta ``family_id``: siempre se toma del perfil del usuario
    (anti-abuso multi-familia, contrato 3.2). Tampoco acepta ``is_default``:
    las categorias por defecto las siembra el agente G, no el usuario.
    """
    name: str = Field(min_length=1, max_length=80)
    type: CategoryType
    icon: Optional[str] = Field(default=None, max_length=60)

class CategoryUpdate(BaseModel):
    """Payload de PATCH /categories/{id}. Solo nombre e icono son editables."""
    name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    icon: Optional[str] = Field(default=None, max_length=60)

class CategoryDeleteResponse(BaseModel):
    """Respuesta de DELETE /categories/{id}.

    ``warnings`` detalla lo que queda sin categoria. Nunca se borra historial:
    las FKs usan ``on delete set null``.
    """
    deleted: bool
    warnings: dict

class CategoryRuleCreate(BaseModel):
    """Payload de POST /categories/rules (regla aprendida).

    ``category`` es el NOMBRE de una categoria existente de la familia.
    ``user_id`` sale siempre del token, nunca del body.
    """
    merchant: str = Field(min_length=1, max_length=120)
    raw_keyword: str = Field(min_length=1, max_length=120)
    category: str = Field(min_length=1, max_length=80)

class CategoryRuleResponse(BaseModel):
    id: UUID
    user_id: Optional[UUID] = None
    family_id: Optional[UUID] = None
    merchant: str
    raw_keyword: str
    category: str
    updated_at: Optional[str] = None

# --- Impacto de un borrado ------------------------------------------------
# "Que pasa si borro esta categoria?". No escribe nada: solo informa.

class CategoryImpactCategory(BaseModel):
    """Categoría consultada (la que se quiere borrar)."""
    id: UUID
    name: Optional[str] = None
    type: Optional[str] = None

class CategoryImpactCounts(BaseModel):
    """Totales reales, aunque las listas de detalle estén truncadas."""
    transactions: int = 0
    budgets: int = 0
    items: int = 0
    debts: int = 0

class CategoryImpactTransaction(BaseModel):
    id: Optional[UUID] = None
    description: Optional[str] = None
    amount: Optional[float] = None
    date: Optional[str] = None
    type: Optional[str] = None

class CategoryImpactBudget(BaseModel):
    """El presupuesto no tiene `name`: el nombre de la categoría lo da la ruta."""
    id: Optional[UUID] = None
    amount: Optional[float] = None
    period: Optional[str] = None
    month: Optional[int] = None
    week_number: Optional[int] = None
    year: Optional[int] = None
    user_id: Optional[UUID] = None

class CategoryImpactItem(BaseModel):
    id: Optional[UUID] = None
    transaction_id: Optional[UUID] = None
    item_name: Optional[str] = None
    quantity: Optional[float] = None
    total_price: Optional[float] = None
    transaction_description: Optional[str] = None

class CategoryImpactDebt(BaseModel):
    id: Optional[UUID] = None
    description: Optional[str] = None
    total_amount: Optional[float] = None
    remaining_amount: Optional[float] = None
    type: Optional[str] = None
    due_date: Optional[str] = None

class CategoryImpactResponse(BaseModel):
    """Respuesta de GET /categories/{id}/impact."""
    category: CategoryImpactCategory
    counts: CategoryImpactCounts
    transactions: List[CategoryImpactTransaction] = []
    budgets: List[CategoryImpactBudget] = []
    items: List[CategoryImpactItem] = []
    debts: List[CategoryImpactDebt] = []

class CategoryReassignRequest(BaseModel):
    """Payload de PATCH /categories/{id}/reassign.

    NO acepta `family_id`: el alcance sale del token (anti-abuso
    multi-familia, contrato 3.2).
    """
    target_category_id: UUID

class CategoryReassignResponse(BaseModel):
    """Respuesta de PATCH /categories/{id}/reassign."""
    moved: CategoryImpactCounts
