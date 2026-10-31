"""Endpoints de OCR de recibos y facturas.

Reglas de seguridad:
  - Ambos endpoints exigen `Authorization: Bearer <supabase_jwt>`.
  - Solo se usan las categorías de la familia del usuario
    (`is_default == True OR family_id == <familia>`); nunca la lista global.
"""

from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from typing import Optional, List, Dict, Any, Tuple
import zipfile
import io
import os
import asyncio
from app.dependencies import get_current_user
from app.services.ocr_service import extract_receipt_data, OCRExtractionResult
from app.services.categories_service import CategoriesService
from app.repositories.categories_repository import CategoriesRepository
import logging

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/ocr",
    tags=["OCR"],
)

# Extensiones aceptadas dentro de un ZIP
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".pdf", ".webp"}
# Tope de tamaño por archivo (evita quemar tokens con fotos gigantes)
MAX_FILE_BYTES = 10 * 1024 * 1024
# Máximo de archivos en paralelo dentro del bulk (protege el rate limit de Gemini)
BULK_CONCURRENCY = 3


def get_categories_service() -> CategoriesService:
    return CategoriesService(CategoriesRepository())


async def _get_family_context(
    user_id: str, service: CategoriesService
) -> Tuple[Optional[str], List[Dict[str, Any]]]:
    """Devuelve (family_id, categorías visibles para el usuario).

    El router no consulta la base de datos: delega en el servicio de
    categorías (Router -> Service -> Repository).

    Nunca devuelve categorías de otras familias: si el usuario no tiene perfil
    o familia, se usan únicamente las categorías por defecto.
    """
    return await service.get_family_context(user_id)


async def _run_extractions(
    tasks: List[Tuple[bytes, str, Optional[str], bool]],
    categories: List[Dict[str, Any]],
    family_id: Optional[str],
    concurrency: int = BULK_CONCURRENCY,
) -> List[OCRExtractionResult]:
    """Procesa los archivos en paralelo (O8) con un semáforo de `concurrency`.

    Un archivo que falle no tumba el lote: se registra el error y se omite.
    El orden de los resultados respeta el orden de entrada.
    """
    semaphore = asyncio.Semaphore(concurrency)

    async def _process_one(
        task: Tuple[bytes, str, Optional[str], bool]
    ) -> Optional[OCRExtractionResult]:
        file_bytes, mime_type, label, prefix_description = task
        async with semaphore:
            try:
                result = await extract_receipt_data(
                    file_bytes, mime_type, categories=categories, family_id=family_id
                )
                if prefix_description and label and result.description:
                    result.description = f"{label}: {result.description}"
                return result
            except Exception as exc:
                logger.error(f"Error procesando {label or 'archivo'}: {exc}")
                return None

    outcomes = await asyncio.gather(*[_process_one(task) for task in tasks])
    return [outcome for outcome in outcomes if outcome is not None]


@router.post("/extract", response_model=OCRExtractionResult)
async def extract_receipt(
    file: UploadFile = File(...),
    user=Depends(get_current_user),
    categories_service: CategoriesService = Depends(get_categories_service),
):
    """Extrae los datos de un recibo/factura (imagen o PDF)."""
    content_type = file.content_type or ""
    if not content_type.startswith("image/") and content_type != "application/pdf":
        raise HTTPException(
            status_code=400,
            detail="Solo se admiten archivos de imagen o PDF",
        )
    try:
        content = await file.read()
        # Reject oversized uploads early to avoid burning Gemini tokens/time
        # on giant phone photos. 10 MB covers any sane receipt at 4K resolution.
        if len(content) > MAX_FILE_BYTES:
            raise HTTPException(
                status_code=413, detail="La imagen es demasiado grande (máximo 10 MB)"
            )

        family_id, categories = await _get_family_context(user.id, categories_service)
        result = await extract_receipt_data(
            content, content_type, categories=categories, family_id=family_id
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error extracting receipt data: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"No se pudo procesar el recibo: {str(e)}",
        )


@router.post("/extract-bulk", response_model=List[OCRExtractionResult])
async def extract_bulk(
    files: List[UploadFile] = File(...),
    user=Depends(get_current_user),
    categories_service: CategoriesService = Depends(get_categories_service),
):
    """Extrae los datos de varios recibos/facturas (archivos sueltos o un ZIP)."""
    try:
        family_id, categories = await _get_family_context(user.id, categories_service)
    except Exception as e:
        logger.error(f"Error cargando las categorías de la familia: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="No se pudieron cargar las categorías de la familia",
        )

    tasks: List[Tuple[bytes, str, Optional[str], bool]] = []

    for file in files:
        filename = file.filename or ""
        if filename.lower().endswith(".zip"):
            content = await file.read()
            try:
                with zipfile.ZipFile(io.BytesIO(content)) as z:
                    for zinfo in z.infolist():
                        if zinfo.is_dir():
                            continue

                        # Check extensions
                        ext = os.path.splitext(zinfo.filename)[1].lower()
                        if ext not in ALLOWED_EXTENSIONS:
                            continue

                        with z.open(zinfo.filename) as f:
                            file_bytes = f.read()
                        mime_type = "application/pdf" if ext == ".pdf" else "image/jpeg"
                        tasks.append((file_bytes, mime_type, zinfo.filename, True))
            except zipfile.BadZipFile:
                logger.error(f"El archivo {filename} no es un ZIP válido")
            except Exception as e:
                logger.error(f"Error leyendo el ZIP {filename}: {e}")
        else:
            # Normal file processing
            content_type = file.content_type or ""
            if not content_type.startswith("image/") and content_type != "application/pdf":
                continue

            content = await file.read()
            if len(content) > MAX_FILE_BYTES:
                logger.warning(f"El archivo {filename} supera el tamaño máximo y se omite")
                continue
            tasks.append((content, content_type, filename or None, False))

    return await _run_extractions(tasks, categories, family_id)
