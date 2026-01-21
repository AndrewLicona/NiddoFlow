from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from typing import List, Optional
from datetime import datetime
import io
from app.dependencies import get_current_user
from app.models.transaction import TransactionCreate, TransactionResponse, TransactionUpdate
from app.repositories.transactions_repository import TransactionsRepository
from app.services.transactions_service import TransactionsService

# PDF Imports
from io import BytesIO
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors

router = APIRouter(prefix="/transactions", tags=["transactions"])

def get_transactions_service():
    repo = TransactionsRepository()
    return TransactionsService(repo)

@router.post("/", response_model=TransactionResponse)
async def create_transaction(
    transaction: TransactionCreate, 
    user = Depends(get_current_user),
    service: TransactionsService = Depends(get_transactions_service)
):
    try:
        return await service.create_transaction(user.id, transaction.model_dump())
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/", response_model=List[TransactionResponse])
async def get_transactions(
    scope: str = "family", 
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: Optional[int] = None,
    user = Depends(get_current_user),
    service: TransactionsService = Depends(get_transactions_service)
):
    return await service.get_transactions(user.id, scope, start_date, end_date, limit)

@router.patch("/{transaction_id}", response_model=TransactionResponse)
async def update_transaction(
    transaction_id: str, 
    updates: TransactionUpdate, 
    user = Depends(get_current_user),
    service: TransactionsService = Depends(get_transactions_service)
):
    try:
        return await service.update_transaction(user.id, transaction_id, updates.model_dump(exclude_unset=True))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/{transaction_id}")
async def delete_transaction(
    transaction_id: str, 
    user = Depends(get_current_user),
    service: TransactionsService = Depends(get_transactions_service)
):
    try:
        await service.delete_transaction(user.id, transaction_id)
        return {"status": "success", "message": "Transaction deleted"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/export")
async def export_transactions(
    scope: str = "family",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user = Depends(get_current_user),
    service: TransactionsService = Depends(get_transactions_service)
):
    # For now keeping PDF logic here or we could move it to a helper. 
    # Let's use the service to get the data first.
    transactions = await service.get_transactions(user.id, scope, start_date, end_date)
    
    # Generar PDF (same logic as before but using enriched data)
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=30, leftMargin=30, topMargin=30, bottomMargin=18)
    
    data = [["Fecha", "Tipo", "Descripción", "Monto", "Categoría", "Cuenta", "Usuario", "Recibo"]]
    styles = getSampleStyleSheet()
    link_style = styles["BodyText"]
    link_style.alignment = 1 # Center

    for tx in transactions:
        receipt_cell = "-"
        if tx.get("receipt_url"):
            receipt_cell = Paragraph(f'<a href="{tx.get("receipt_url")}" color="blue">Ver</a>', link_style)

        data.append([
            tx.get("date")[:10],
            tx.get("type"),
            Paragraph(tx.get("description") or "", styles['Normal']),
            f"${tx.get('amount'):,.2f}",
            tx.get("category_name") or "-",
            tx.get("account_name") or "-",
            tx.get("user_name") or "-",
            receipt_cell
        ])

    table = Table(data, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
    ]))
    
    elements = [table]
    doc.build(elements)
    buffer.seek(0)
    filename = f"audit_export_{scope}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
