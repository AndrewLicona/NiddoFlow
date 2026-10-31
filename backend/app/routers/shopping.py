from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from uuid import UUID

from app.dependencies import get_current_user
from app.models.shopping import (
    ShoppingItemCreate,
    ShoppingItemResponse,
    ShoppingItemUpdate,
    ShoppingPurchaseRequest,
)
from app.repositories.shopping_repository import ShoppingRepository
from app.services.shopping_service import ShoppingService

router = APIRouter(prefix="/shopping", tags=["shopping"])

def get_shopping_service():
    repo = ShoppingRepository()
    return ShoppingService(repo)

@router.get("/", response_model=List[ShoppingItemResponse])
async def get_shopping_items(
    scope: str = "family",
    status: Optional[str] = None,
    user = Depends(get_current_user),
    service: ShoppingService = Depends(get_shopping_service)
):
    """Lista las necesidades de la familia (scope=personal: solo las del usuario)."""
    return await service.get_shopping_items(user.id, scope, status)

@router.post("/", response_model=ShoppingItemResponse, status_code=201)
async def create_shopping_item(
    item: ShoppingItemCreate,
    user = Depends(get_current_user),
    service: ShoppingService = Depends(get_shopping_service)
):
    try:
        return await service.create_shopping_item(user.id, item.model_dump())
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.patch("/{item_id}", response_model=ShoppingItemResponse)
async def update_shopping_item(
    item_id: UUID,
    updates: ShoppingItemUpdate,
    user = Depends(get_current_user),
    service: ShoppingService = Depends(get_shopping_service)
):
    try:
        return await service.update_shopping_item(
            user.id, str(item_id), updates.model_dump(exclude_unset=True)
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/{item_id}")
async def delete_shopping_item(
    item_id: UUID,
    user = Depends(get_current_user),
    service: ShoppingService = Depends(get_shopping_service)
):
    try:
        return await service.delete_shopping_item(user.id, str(item_id))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{item_id}/purchase", response_model=ShoppingItemResponse)
async def purchase_shopping_item(
    item_id: UUID,
    purchase: ShoppingPurchaseRequest,
    user = Depends(get_current_user),
    service: ShoppingService = Depends(get_shopping_service)
):
    """Compra la necesidad: crea el movimiento y la marca como comprada."""
    try:
        return await service.purchase_shopping_item(
            user.id, str(item_id), purchase.model_dump()
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
