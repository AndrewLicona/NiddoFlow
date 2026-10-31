from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from uuid import UUID

from app.dependencies import get_current_user
from app.models.category import (
    CategoryCreate,
    CategoryDeleteResponse,
    CategoryImpactResponse,
    CategoryReassignRequest,
    CategoryReassignResponse,
    CategoryResponse,
    CategoryRuleCreate,
    CategoryRuleResponse,
    CategoryUpdate,
)
from app.repositories.categories_repository import CategoriesRepository
from app.services.categories_service import CategoriesService, CategoryServiceError

router = APIRouter(prefix="/categories", tags=["categories"])

def get_categories_service():
    repo = CategoriesRepository()
    return CategoriesService(repo)

def _raise_http_error(exc: CategoryServiceError):
    """Traduce un error de dominio al status HTTP correspondiente."""
    detail = {"message": exc.message}
    detail.update(exc.extra)
    raise HTTPException(status_code=exc.status_code, detail=detail)

@router.get("/", response_model=List[CategoryResponse])
async def get_categories(
    user = Depends(get_current_user),
    service: CategoriesService = Depends(get_categories_service)
):
    return await service.get_categories(user.id)

@router.post("/", response_model=CategoryResponse, status_code=201)
async def create_category(
    category: CategoryCreate,
    user = Depends(get_current_user),
    service: CategoriesService = Depends(get_categories_service)
):
    """Crea una categoria propia de la familia del usuario.

    El ``family_id`` SIEMPRE sale del token: nunca del body.
    """
    try:
        return await service.create_category(user.id, category.model_dump())
    except CategoryServiceError as e:
        _raise_http_error(e)
    except Exception as e:
        raise HTTPException(status_code=400, detail={"message": str(e)})

@router.patch("/{category_id}", response_model=CategoryResponse)
async def update_category(
    category_id: UUID,
    updates: CategoryUpdate,
    user = Depends(get_current_user),
    service: CategoriesService = Depends(get_categories_service)
):
    """Renombra o cambia el icono. 403 si es default o de otra familia."""
    try:
        return await service.update_category(
            user.id, str(category_id), updates.model_dump(exclude_unset=True)
        )
    except CategoryServiceError as e:
        _raise_http_error(e)
    except Exception as e:
        raise HTTPException(status_code=400, detail={"message": str(e)})

@router.delete("/{category_id}", response_model=CategoryDeleteResponse)
async def delete_category(
    category_id: UUID,
    user = Depends(get_current_user),
    service: CategoriesService = Depends(get_categories_service)
):
    """Borra la categoria. Nunca borra historial: devuelve los ``warnings``."""
    try:
        return await service.delete_category(user.id, str(category_id))
    except CategoryServiceError as e:
        _raise_http_error(e)
    except Exception as e:
        raise HTTPException(status_code=400, detail={"message": str(e)})

# --- Impacto y reasignacion ------------------------------------------------
# "/{category_id}/impact" y "/{category_id}/reassign" tienen dos segmentos, asi
# que no colisionan con "/rules" ni con "/{category_id}".

@router.get("/{category_id}/impact", response_model=CategoryImpactResponse)
async def get_category_impact(
    category_id: UUID,
    user = Depends(get_current_user),
    service: CategoriesService = Depends(get_categories_service)
):
    """Detalle de lo que usa la categoria. No escribe nada.

    403 si la categoria es por defecto o es de otra familia.
    """
    try:
        return await service.get_category_impact(user.id, str(category_id))
    except CategoryServiceError as e:
        _raise_http_error(e)
    except Exception as e:
        raise HTTPException(status_code=400, detail={"message": str(e)})

@router.patch("/{category_id}/reassign", response_model=CategoryReassignResponse)
async def reassign_category(
    category_id: UUID,
    payload: CategoryReassignRequest,
    user = Depends(get_current_user),
    service: CategoriesService = Depends(get_categories_service)
):
    """Mueve lo que usa la categoria hacia otra categoria.

    400 si el destino es del mismo tipo contrario o es la misma categoria,
    403 si el destino es de otra familia.
    """
    try:
        return await service.reassign_category(
            user.id, str(category_id), str(payload.target_category_id)
        )
    except CategoryServiceError as e:
        _raise_http_error(e)
    except Exception as e:
        raise HTTPException(status_code=400, detail={"message": str(e)})

# --- Reglas aprendidas (user_category_rules) -------------------------------
# "rules" no colisiona con "/{category_id}": ese parametro es un UUID, asi
# que FastAPI no puede encajar la palabra "rules" ahi.

@router.post("/rules", response_model=CategoryRuleResponse, status_code=201)
async def create_category_rule(
    rule: CategoryRuleCreate,
    user = Depends(get_current_user),
    service: CategoriesService = Depends(get_categories_service)
):
    """Crea o actualiza una regla aprendida. ``user_id`` sale del token."""
    try:
        return await service.create_category_rule(
            user.id, rule.merchant, rule.raw_keyword, rule.category
        )
    except CategoryServiceError as e:
        _raise_http_error(e)
    except Exception as e:
        raise HTTPException(status_code=400, detail={"message": str(e)})

@router.get("/rules", response_model=List[CategoryRuleResponse])
async def get_category_rules(
    merchant: Optional[str] = None,
    user = Depends(get_current_user),
    service: CategoriesService = Depends(get_categories_service)
):
    """Lista las reglas aprendidas del usuario, opcionalmente por comercio."""
    try:
        return await service.get_category_rules(user.id, merchant)
    except CategoryServiceError as e:
        _raise_http_error(e)
    except Exception as e:
        raise HTTPException(status_code=400, detail={"message": str(e)})
