from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_current_user
from app.models.insights import InsightsResponse
from app.repositories.insights_repository import InsightsRepository
from app.services.insights_service import MONTH_REGEX, InsightsService

router = APIRouter(prefix="/insights", tags=["insights"])


def get_insights_service():
    repo = InsightsRepository()
    return InsightsService(repo)


@router.get("/", response_model=InsightsResponse)
async def get_insights(
    scope: str = "family",
    month: Optional[str] = None,
    user = Depends(get_current_user),
    service: InsightsService = Depends(get_insights_service),
):
    """Analitica completa del mes, calculada en el servidor.

    - `scope=family` (default): cuentas conjuntas + cuentas personales del usuario.
    - `scope=personal`: solo cuentas con `user_id` del usuario.
    - `month=YYYY-MM`: mes a analizar (default: mes actual).
    """
    scope = (scope or "family").strip().lower()
    if scope not in ("family", "personal"):
        raise HTTPException(
            status_code=400,
            detail="El scope debe ser 'family' o 'personal'",
        )

    if month:
        month = month.strip()
        if not MONTH_REGEX.match(month):
            raise HTTPException(
                status_code=400,
                detail="El mes debe tener el formato YYYY-MM (por ejemplo 2026-10)",
            )

    return await service.get_insights(user.id, scope, month)
