"""Router del importador de movimientos bancarios.

Flujo de dos pasos:
    POST /import/preview   -> analiza el archivo, NO escribe nada
    POST /import/commit    -> crea solo las filas confirmadas por el usuario
"""

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from typing import Optional

from app.dependencies import get_current_user
from app.models.bank_import import ImportCommitRequest, ImportCommitResponse, ImportPreviewResponse
from app.repositories.import_repository import ImportRepository
from app.services.bank_import_service import ImportService

router = APIRouter(prefix="/import", tags=["import"])

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


def get_import_service() -> ImportService:
    return ImportService(ImportRepository())


@router.post("/preview", response_model=ImportPreviewResponse)
async def preview_import(
    file: UploadFile = File(...),
    user=Depends(get_current_user),
    service: ImportService = Depends(get_import_service),
):
    """Analiza el archivo y devuelve qué se crearía. NO escribe nada."""
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="El archivo está vacío.")
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="El archivo supera el máximo de 10 MB.")

    try:
        return await service.preview(str(user.id), content, file.filename or "")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"No se pudo analizar el archivo: {exc}")


@router.post("/commit", response_model=ImportCommitResponse)
async def commit_import(
    payload: ImportCommitRequest,
    user=Depends(get_current_user),
    service: ImportService = Depends(get_import_service),
):
    """Crea los movimientos seleccionados. Nunca borra nada existente."""
    try:
        return await service.commit(str(user.id), payload)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"No se pudo completar la importación: {exc}")
