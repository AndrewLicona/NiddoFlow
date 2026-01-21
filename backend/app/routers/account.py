from fastapi import APIRouter, Depends, HTTPException
from typing import List
from app.dependencies import get_current_user
from app.models.account import AccountCreate, AccountResponse
from app.repositories.accounts_repository import AccountsRepository
from app.services.accounts_service import AccountsService

router = APIRouter(prefix="/accounts", tags=["accounts"])

def get_accounts_service():
    repo = AccountsRepository()
    return AccountsService(repo)

@router.post("/", response_model=AccountResponse)
async def create_account(
    account: AccountCreate, 
    user = Depends(get_current_user),
    service: AccountsService = Depends(get_accounts_service)
):
    try:
        return await service.create_account(user.id, account.model_dump())
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/", response_model=List[AccountResponse])
async def get_my_accounts(
    user = Depends(get_current_user),
    service: AccountsService = Depends(get_accounts_service)
):
    # Fixed the typo in my thought process but let's be careful in code
    return await service.get_my_accounts(user.id)
