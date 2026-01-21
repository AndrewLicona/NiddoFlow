from fastapi import APIRouter, Depends, HTTPException
from typing import List
from app.dependencies import get_current_user
from app.models.family import FamilyCreate, FamilyResponse
from app.repositories.family_repository import FamilyRepository
from app.services.family_service import FamilyService
from pydantic import BaseModel

router = APIRouter(prefix="/families", tags=["families"])

def get_family_service():
    repo = FamilyRepository()
    return FamilyService(repo)

@router.post("/", response_model=FamilyResponse)
async def create_family(
    family: FamilyCreate, 
    user = Depends(get_current_user),
    service: FamilyService = Depends(get_family_service)
):
    try:
        return await service.create_family(user.id, family.name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class JoinFamilyRequest(BaseModel):
    invite_code: str

@router.post("/join", response_model=FamilyResponse)
async def join_family(
    request: JoinFamilyRequest, 
    user = Depends(get_current_user),
    service: FamilyService = Depends(get_family_service)
):
    try:
        return await service.join_family(user.id, request.invite_code)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/leave", response_model=bool)
async def leave_family(
    user = Depends(get_current_user),
    service: FamilyService = Depends(get_family_service)
):
    return await service.leave_family(user.id)

@router.get("/members", response_model=List[dict])
async def get_family_members(
    user = Depends(get_current_user),
    service: FamilyService = Depends(get_family_service)
):
    return await service.get_family_members(user.id)

@router.get("/", response_model=List[FamilyResponse])
async def get_my_family(
    user = Depends(get_current_user),
    service: FamilyService = Depends(get_family_service)
):
    return await service.get_my_family(user.id)
