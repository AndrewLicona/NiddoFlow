from fastapi import APIRouter, Depends
from typing import List
from app.dependencies import get_current_user
from app.models.category import CategoryResponse
from app.repositories.categories_repository import CategoriesRepository
from app.services.categories_service import CategoriesService

router = APIRouter(prefix="/categories", tags=["categories"])

def get_categories_service():
    repo = CategoriesRepository()
    return CategoriesService(repo)

@router.get("/", response_model=List[CategoryResponse])
async def get_categories(
    user = Depends(get_current_user),
    service: CategoriesService = Depends(get_categories_service)
):
    return await service.get_categories(user.id)
