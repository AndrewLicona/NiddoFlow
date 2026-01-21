from fastapi import APIRouter, Depends, HTTPException
from typing import List
from app.dependencies import get_current_user
from app.models.budget import BudgetCreate, BudgetResponse
from app.repositories.budgets_repository import BudgetsRepository
from app.services.budgets_service import BudgetsService
from uuid import UUID

router = APIRouter(prefix="/budgets", tags=["budgets"])

def get_budgets_service():
    repo = BudgetsRepository()
    return BudgetsService(repo)

@router.get("/", response_model=List[BudgetResponse])
async def get_budgets(
    scope: str = "family", 
    user = Depends(get_current_user),
    service: BudgetsService = Depends(get_budgets_service)
):
    return await service.get_budgets(user.id, scope)

@router.post("/", response_model=BudgetResponse)
async def create_budget(
    budget: BudgetCreate, 
    user = Depends(get_current_user),
    service: BudgetsService = Depends(get_budgets_service)
):
    try:
        return await service.create_or_update_budget(user.id, budget.model_dump())
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/{budget_id}")
async def delete_budget(
    budget_id: UUID, 
    user = Depends(get_current_user),
    service: BudgetsService = Depends(get_budgets_service)
):
    await service.delete_budget(user.id, str(budget_id))
    return {"status": "deleted"}
