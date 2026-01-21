from fastapi import APIRouter, Depends, HTTPException
from typing import List
from app.dependencies import get_current_user
from app.repositories.stats_repository import StatsRepository
from app.services.stats_service import StatsService
from pydantic import BaseModel

router = APIRouter(prefix="/stats", tags=["stats"])

# Models
class TrendPoint(BaseModel):
    date: str
    income: float
    expense: float

class DashboardStats(BaseModel):
    total_balance: float
    monthly_income: float
    monthly_expense: float
    trends: List[TrendPoint]

# Dependency injection
def get_stats_service():
    repo = StatsRepository()
    return StatsService(repo)

@router.get("/dashboard", response_model=DashboardStats)
async def get_dashboard_stats(
    user = Depends(get_current_user),
    service: StatsService = Depends(get_stats_service)
):
    stats = await service.get_dashboard_summary(user.id)
    if not stats:
        raise HTTPException(status_code=404, detail="Profile or summary not found")
    
    return stats
