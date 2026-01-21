from fastapi import APIRouter, Depends, HTTPException
from typing import List
from app.dependencies import get_current_user
from app.models.debt import DebtCreate, DebtResponse
from app.repositories.debts_repository import DebtsRepository
from app.services.debts_service import DebtsService
from uuid import UUID

router = APIRouter(prefix="/debts", tags=["debts"])

def get_debts_service():
    repo = DebtsRepository()
    return DebtsService(repo)

@router.get("/", response_model=List[DebtResponse])
async def get_debts(
    user = Depends(get_current_user),
    service: DebtsService = Depends(get_debts_service)
):
    return await service.get_debts(user.id)

@router.post("/", response_model=DebtResponse)
async def create_debt(
    debt: DebtCreate, 
    user = Depends(get_current_user),
    service: DebtsService = Depends(get_debts_service)
):
    try:
        return await service.create_debt(user.id, debt.model_dump())
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.patch("/{debt_id}", response_model=DebtResponse)
async def update_debt(
    debt_id: UUID, 
    update_data: dict, 
    user = Depends(get_current_user),
    service: DebtsService = Depends(get_debts_service)
):
    try:
        return await service.update_debt(user.id, str(debt_id), update_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/{debt_id}")
async def delete_debt(
    debt_id: UUID, 
    user = Depends(get_current_user),
    service: DebtsService = Depends(get_debts_service)
):
    await service.delete_debt(user.id, str(debt_id))
    return {"status": "deleted"}

@router.post("/{debt_id}/pay")
async def pay_debt(
    debt_id: UUID,
    payment_data: dict,
    user = Depends(get_current_user),
    service: DebtsService = Depends(get_debts_service)
):
    try:
        return await service.pay_debt(user.id, str(debt_id), payment_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
