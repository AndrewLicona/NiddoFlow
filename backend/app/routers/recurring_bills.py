"""Router de las cuentas por pagar recurrentes del hogar."""

from fastapi import APIRouter, Depends, HTTPException
from typing import List

from app.dependencies import get_current_user
from app.models.recurring_bill import (
    RecurringBillCreate,
    RecurringBillResponse,
    RecurringBillUpdate,
    RecurringBillsSummary,
)
from app.repositories.recurring_bills_repository import RecurringBillsRepository
from app.services.recurring_bills_service import RecurringBillsService

router = APIRouter(prefix="/recurring-bills", tags=["recurring bills"])


def get_recurring_bills_service():
    return RecurringBillsService(RecurringBillsRepository())


@router.get("/", response_model=RecurringBillsSummary)
async def get_recurring_bills(
    user=Depends(get_current_user),
    service: RecurringBillsService = Depends(get_recurring_bills_service),
):
    """Cuentas por pagar del hogar con el total mensual y los vencimientos."""
    return await service.get_bills(user.id)


@router.post("/", response_model=RecurringBillResponse)
async def create_recurring_bill(
    bill: RecurringBillCreate,
    user=Depends(get_current_user),
    service: RecurringBillsService = Depends(get_recurring_bills_service),
):
    try:
        created = await service.create_bill(user.id, bill)
        return created
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.patch("/{bill_id}", response_model=RecurringBillResponse)
async def update_recurring_bill(
    bill_id: str,
    updates: RecurringBillUpdate,
    user=Depends(get_current_user),
    service: RecurringBillsService = Depends(get_recurring_bills_service),
):
    try:
        return await service.update_bill(user.id, bill_id, updates)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.delete("/{bill_id}")
async def delete_recurring_bill(
    bill_id: str,
    user=Depends(get_current_user),
    service: RecurringBillsService = Depends(get_recurring_bills_service),
):
    try:
        await service.delete_bill(user.id, bill_id)
        return {"status": "deleted"}
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc))
