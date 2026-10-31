from fastapi import APIRouter, Depends, HTTPException
from typing import List
from uuid import UUID

from app.dependencies import get_current_user
from app.models.goals import (
    GoalContributionRequest,
    GoalCreate,
    GoalResponse,
    GoalUpdate,
)
from app.repositories.goals_repository import GoalsRepository
from app.services.goals_service import GoalsService

router = APIRouter(prefix="/goals", tags=["goals"])

def get_goals_service():
    repo = GoalsRepository()
    return GoalsService(repo)

@router.get("/", response_model=List[GoalResponse])
async def get_goals(
    scope: str = "family",
    user = Depends(get_current_user),
    service: GoalsService = Depends(get_goals_service)
):
    """Lista las metas de ahorro de la familia (scope=personal: solo las del usuario)."""
    return await service.get_goals(user.id, scope)

@router.post("/", response_model=GoalResponse, status_code=201)
async def create_goal(
    goal: GoalCreate,
    user = Depends(get_current_user),
    service: GoalsService = Depends(get_goals_service)
):
    try:
        return await service.create_goal(user.id, goal.model_dump())
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.patch("/{goal_id}", response_model=GoalResponse)
async def update_goal(
    goal_id: UUID,
    updates: GoalUpdate,
    user = Depends(get_current_user),
    service: GoalsService = Depends(get_goals_service)
):
    try:
        return await service.update_goal(
            user.id, str(goal_id), updates.model_dump(exclude_unset=True)
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/{goal_id}")
async def delete_goal(
    goal_id: UUID,
    user = Depends(get_current_user),
    service: GoalsService = Depends(get_goals_service)
):
    try:
        return await service.delete_goal(user.id, str(goal_id))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{goal_id}/contribute", response_model=GoalResponse)
async def contribute_to_goal(
    goal_id: UUID,
    contribution: GoalContributionRequest,
    user = Depends(get_current_user),
    service: GoalsService = Depends(get_goals_service)
):
    """Aporta a la meta: suma a ``saved_amount`` y registra el movimiento."""
    try:
        return await service.contribute_to_goal(
            user.id, str(goal_id), contribution.model_dump()
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
