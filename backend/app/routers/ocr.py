from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from typing import Optional, List
import zipfile
import io
import os
from pydantic import BaseModel
from app.services.ocr_service import extract_receipt_data, OCRExtractionResult
import logging

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/ocr",
    tags=["OCR"],
)

@router.post("/extract", response_model=OCRExtractionResult)
async def extract_receipt(file: UploadFile = File(...)):
    if not file.content_type.startswith("image/") and file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only image and PDF files are supported")
    try:
        content = await file.read()
        from app.db.prisma_db import prisma
        categories_db = await prisma.category.find_many()
        category_names = [c.name for c in categories_db]
        result = await extract_receipt_data(content, file.content_type, categories=category_names)
        return result
    except Exception as e:
        logger.error(f"Error extracting receipt data: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to process image: {str(e)}")

@router.post("/extract-bulk", response_model=List[OCRExtractionResult])
async def extract_bulk(files: List[UploadFile] = File(...)):
    results = []
    
    # Get categories once
    from app.db.prisma_db import prisma
    categories_db = await prisma.category.find_many()
    category_names = [c.name for c in categories_db]

    for file in files:
        if file.filename.endswith('.zip'):
            content = await file.read()
            with zipfile.ZipFile(io.BytesIO(content)) as z:
                for zinfo in z.infolist():
                    if zinfo.is_dir(): continue
                    
                    # Check extensions
                    ext = os.path.splitext(zinfo.filename)[1].lower()
                    if ext not in ['.jpg', '.jpeg', '.png', '.pdf', '.webp']: continue
                    
                    with z.open(zinfo.filename) as f:
                        file_bytes = f.read()
                        mime_type = "application/pdf" if ext == ".pdf" else "image/jpeg"
                        try:
                            res = await extract_receipt_data(file_bytes, mime_type, categories=category_names)
                            res.description = f"{zinfo.filename}: {res.description}"
                            results.append(res)
                        except Exception as e:
                            logger.error(f"Error processing {zinfo.filename} from ZIP: {e}")
        else:
            # Normal file processing
            if not file.content_type.startswith("image/") and file.content_type != "application/pdf":
                continue
            
            content = await file.read()
            mime_type = file.content_type
            try:
                res = await extract_receipt_data(content, mime_type, categories=category_names)
                results.append(res)
            except Exception as e:
                logger.error(f"Error processing {file.filename}: {e}")
    
    return results
