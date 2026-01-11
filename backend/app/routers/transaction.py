from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from typing import List, Optional
from datetime import datetime
import csv
import io
from app.dependencies import get_current_user
from app.models.transaction import TransactionCreate, TransactionResponse, TransactionUpdate
from app.db.supabase import supabase

# PDF Imports
from io import BytesIO
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors

router = APIRouter(prefix="/transactions", tags=["transactions"])

@router.post("/", response_model=TransactionResponse)
async def create_transaction(transaction: TransactionCreate, user = Depends(get_current_user)):
    # 1. Get User Profile to find Family ID
    profile_res = supabase.table("profiles").select("family_id").eq("id", user.id).execute()
    if not profile_res.data or not profile_res.data[0].get('family_id'):
         raise HTTPException(status_code=400, detail="User does not belong to a family")
    
    family_id = profile_res.data[0]['family_id']

    # 2. Insert Transaction
    data = transaction.model_dump()
    data['user_id'] = str(user.id)
    data['family_id'] = family_id
    data['date'] = data['date'].isoformat()
    data['category_id'] = str(data['category_id']) if data['category_id'] else None
    data['account_id'] = str(data['account_id'])
    # Include target account for transfers if provided
    if getattr(transaction, 'target_account_id', None):
        data['target_account_id'] = str(transaction.target_account_id)
    else:
        data['target_account_id'] = None

    res = supabase.table("transactions").insert(data).execute()
    
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create transaction")
    
    # 3. Update Account Balance for source account
    amount = transaction.amount
    if transaction.type == 'expense' or transaction.type == 'transfer':
        impact = -amount
    else:
        impact = amount

    # Update source account balance
    account_res = supabase.table("accounts").select("balance").eq("id", data['account_id']).execute()
    if account_res.data:
        current_balance = account_res.data[0]['balance']
        new_balance = current_balance + impact
        supabase.table("accounts").update({"balance": new_balance}).eq("id", data['account_id']).execute()

    # If transfer, credit target account
    if transaction.type == 'transfer' and data.get('target_account_id'):
        target_res = supabase.table("accounts").select("balance").eq("id", data['target_account_id']).execute()
        if target_res.data:
            target_balance = target_res.data[0]['balance']
            new_target_balance = target_balance + amount  # credit full amount
            supabase.table("accounts").update({"balance": new_target_balance}).eq("id", data['target_account_id']).execute()

    return res.data[0]

@router.get("/", response_model=List[TransactionResponse])
async def get_transactions(
    scope: str = "family", 
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: Optional[int] = None,
    user = Depends(get_current_user)
):
    # 1. Get Family ID
    profile_res = supabase.table("profiles").select("family_id").eq("id", user.id).execute()
    if not profile_res.data or not profile_res.data[0].get('family_id'):
         return []
    
    family_id = profile_res.data[0]['family_id']

    # 2. Fetch Transactions with Strict Account Scoping
    if scope == "personal":
        # Only transactions on Personal Accounts owned by the user
        acc_res = supabase.table("accounts").select("id").eq("user_id", str(user.id)).execute()
        personal_account_ids = [a['id'] for a in (acc_res.data or [])]
        
        if not personal_account_ids:
            return []
            
        res = supabase.table("transactions").select("*").in_("account_id", personal_account_ids).order("date", desc=True).execute()
        transactions_data = res.data or []
    else:
        # Family Scope:
        # 1. Family Accounts (user_id is None)
        # 2. My Personal Accounts
        # 3. GLOBAL: All 'transfer' transactions regardless of account
        
        all_accounts_res = supabase.table("accounts").select("id, user_id").eq("family_id", family_id).execute()
        all_accounts = all_accounts_res.data or []
        
        valid_account_ids = []
        for acc in all_accounts:
            acc_user_id = acc.get('user_id')
            if not acc_user_id or str(acc_user_id) == str(user.id):
                valid_account_ids.append(acc['id'])

        # 1. Get transactions from allowed accounts
        tx_allowed = []
        if valid_account_ids:
            q = supabase.table("transactions").select("*").in_("account_id", valid_account_ids)
            if start_date: q = q.gte("date", start_date)
            if end_date: q = q.lte("date", end_date)
            tx_allowed = q.order("date", desc=True).execute().data or []

        # 2. Get ALL transfers for family
        q_transfers = supabase.table("transactions").select("*").eq("family_id", family_id).eq("type", "transfer")
        if start_date: q_transfers = q_transfers.gte("date", start_date)
        if end_date: q_transfers = q_transfers.lte("date", end_date)
        tx_transfers = q_transfers.order("date", desc=True).execute().data or []

        # 3. Merge
        combined = {t['id']: t for t in tx_allowed}
        for t in tx_transfers:
            combined[t['id']] = t
            
        transactions_data = list(combined.values())
        transactions_data.sort(key=lambda x: x['date'], reverse=True)
        
        if limit:
            transactions_data = transactions_data[:limit]
        
    if not transactions_data:
        return []

    # 3. Fetch auxiliary data
    cat_res = supabase.table("categories").select("id, name").or_(f"family_id.eq.{family_id},is_default.eq.true").execute()
    acc_res = supabase.table("accounts").select("id, name").eq("family_id", family_id).execute()
    
    user_ids = list(set([str(t['user_id']) for t in transactions_data if t.get('user_id')]))
    prof_res = supabase.table("profiles").select("id, full_name").in_("id", user_ids).execute()

    category_map = {str(c['id']): c['name'] for c in (cat_res.data or [])}
    account_map = {str(a['id']): a['name'] for a in (acc_res.data or [])}
    profile_map = {str(p['id']): p['full_name'] for p in (prof_res.data or [])}

    # 4. Map names
    for t in transactions_data:
        t['category_name'] = category_map.get(str(t.get('category_id')))
        t['account_name'] = account_map.get(str(t.get('account_id')))
        t['user_name'] = profile_map.get(str(t.get('user_id')))

    return transactions_data

# ... update_transaction, delete_transaction ... (omitted from replace for brevity if unchanged, but I need to be careful with range)
# Actually I am replacing the end of the file so I will just target export_transactions mostly, 
# but I also modified get_transactions. I should do two replaces or one big one.
# I'll do get_transactions first then export_transactions.

# Actually, I will just use ReplaceFileContent for the specific blocks.


@router.patch("/{transaction_id}", response_model=TransactionResponse)
async def update_transaction(transaction_id: str, updates: TransactionUpdate, user = Depends(get_current_user)):
    profile_res = supabase.table("profiles").select("family_id").eq("id", user.id).execute()
    if not profile_res.data or not profile_res.data[0].get('family_id'):
         raise HTTPException(status_code=400, detail="User does not belong to a family")
    
    family_id = profile_res.data[0]['family_id']

    old_tx_res = supabase.table("transactions").select("*").eq("id", transaction_id).execute()
    if not old_tx_res.data:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    old_tx = old_tx_res.data[0]
    if str(old_tx['family_id']) != str(family_id):
        raise HTTPException(status_code=403, detail="Not authorized to update this transaction")

    # Reverse Old Impact on source account
    old_impact = -old_tx['amount'] if old_tx['type'] in ['expense', 'transfer'] else old_tx['amount']
    old_acc_res = supabase.table("accounts").select("balance").eq("id", old_tx['account_id']).execute()
    if old_acc_res.data:
        supabase.table("accounts").update({
            "balance": old_acc_res.data[0]['balance'] - old_impact
        }).eq("id", old_tx['account_id']).execute()
    # If old transaction was a transfer, reverse impact on target account
    if old_tx['type'] == 'transfer' and old_tx.get('target_account_id'):
        old_target_res = supabase.table("accounts").select("balance").eq("id", old_tx['target_account_id']).execute()
        if old_target_res.data:
            # Reverse the credit that was previously added
            supabase.table("accounts").update({
                "balance": old_target_res.data[0]['balance'] - old_tx['amount']
            }).eq("id", old_tx['target_account_id']).execute()

    # Prepare Updates
    update_data = updates.model_dump(exclude_unset=True)
    if 'date' in update_data:
        update_data['date'] = update_data['date'].isoformat()
    if 'category_id' in update_data:
        update_data['category_id'] = str(update_data['category_id']) if update_data['category_id'] else None
    if 'account_id' in update_data:
        update_data['account_id'] = str(update_data['account_id'])

    new_tx_state = {**old_tx, **update_data}
    
    # Apply New Impact on source account
    new_impact = -new_tx_state['amount'] if new_tx_state['type'] in ['expense', 'transfer'] else new_tx_state['amount']
    new_acc_res = supabase.table("accounts").select("balance").eq("id", new_tx_state['account_id']).execute()
    if new_acc_res.data:
        supabase.table("accounts").update({
            "balance": new_acc_res.data[0]['balance'] + new_impact
        }).eq("id", new_tx_state['account_id']).execute()
    # If new transaction is a transfer, credit target account
    if new_tx_state['type'] == 'transfer' and new_tx_state.get('target_account_id'):
        target_res = supabase.table("accounts").select("balance").eq("id", new_tx_state['target_account_id']).execute()
        if target_res.data:
            supabase.table("accounts").update({
                "balance": target_res.data[0]['balance'] + new_tx_state['amount']
            }).eq("id", new_tx_state['target_account_id']).execute()

    res = supabase.table("transactions").update(update_data).eq("id", transaction_id).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to update transaction")

    return res.data[0]

@router.delete("/{transaction_id}")
async def delete_transaction(transaction_id: str, user = Depends(get_current_user)):
    profile_res = supabase.table("profiles").select("family_id").eq("id", user.id).execute()
    if not profile_res.data or not profile_res.data[0].get('family_id'):
         raise HTTPException(status_code=400, detail="User does not belong to a family")
    
    family_id = profile_res.data[0]['family_id']

    tx_res = supabase.table("transactions").select("*").eq("id", transaction_id).execute()
    if not tx_res.data:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    transaction = tx_res.data[0]
    if str(transaction['family_id']) != str(family_id):
        raise HTTPException(status_code=403, detail="Not authorized to delete this transaction")

    impact = -transaction['amount'] if transaction['type'] in ['expense', 'transfer'] else transaction['amount']
    account_res = supabase.table("accounts").select("balance").eq("id", transaction['account_id']).execute()
    if account_res.data:
        supabase.table("accounts").update({
            "balance": account_res.data[0]['balance'] - impact
        }).eq("id", transaction['account_id']).execute()
    # If transaction is a transfer, also reverse impact on target account
    if transaction['type'] == 'transfer' and transaction.get('target_account_id'):
        target_res = supabase.table("accounts").select("balance").eq("id", transaction['target_account_id']).execute()
        if target_res.data:
            # Reverse the credit that was added when transfer was created
            supabase.table("accounts").update({
                "balance": target_res.data[0]['balance'] - transaction['amount']
            }).eq("id", transaction['target_account_id']).execute()

    supabase.table("transactions").delete().eq("id", transaction_id).execute()
    return {"status": "success", "message": "Transaction deleted"}

@router.get("/export")
async def export_transactions(
    scope: str = "family",  # "family" or "personal"
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user = Depends(get_current_user)
):
    # Obtener family_id del usuario
    profile_res = supabase.table("profiles").select("family_id").eq("id", user.id).execute()
    if not profile_res.data or not profile_res.data[0].get('family_id'):
        raise HTTPException(status_code=400, detail="User does not belong to a family")
    family_id = profile_res.data[0]['family_id']

    # Construir la consulta con Strict Scoping
    query = supabase.table("transactions").select("*")
    
    if scope == "personal":
        # Strict: Solamente cuentas personales del usuario
        acc_res = supabase.table("accounts").select("id").eq("user_id", str(user.id)).execute()
        personal_account_ids = [a['id'] for a in (acc_res.data or [])]
        if not personal_account_ids:
             # Si no tiene cuentas personales, devolver PDF vacío (con cabeceras) o error
             # Mejor una lista vacía
             query = query.in_("account_id", [])
        else:
             query = query.in_("account_id", personal_account_ids)
    else:
        # Family scope: Todo lo de la familia MENOS cuentas personales de OTROS
        all_accounts_res = supabase.table("accounts").select("id, user_id").eq("family_id", family_id).execute()
        all_accounts = all_accounts_res.data or []
        
        valid_account_ids = []
        for acc in all_accounts:
            acc_user_id = acc.get('user_id')
            if not acc_user_id or str(acc_user_id) == str(user.id):
                valid_account_ids.append(acc['id'])
        
        if not valid_account_ids:
             query = query.in_("account_id", [])
        else:
             query = query.in_("account_id", valid_account_ids)

    if start_date:
        query = query.gte("date", start_date)
    if end_date:
        query = query.lte("date", end_date)

    res = query.order("date", desc=True).execute()
    transactions = res.data or []

    # Mapear nombres legibles
    cat_res = supabase.table("categories").select("id, name").or_(f"family_id.eq.{family_id},is_default.eq.true").execute()
    acc_res = supabase.table("accounts").select("id, name").eq("family_id", family_id).execute()
    user_ids = list(set([str(t['user_id']) for t in transactions if t.get('user_id')]))
    prof_res = supabase.table("profiles").select("id, full_name").in_("id", user_ids).execute()
    category_map = {str(c['id']): c['name'] for c in (cat_res.data or [])}
    account_map = {str(a['id']): a['name'] for a in (acc_res.data or [])}
    profile_map = {str(p['id']): p['full_name'] for p in (prof_res.data or [])}

    # Generar PDF
    buffer = BytesIO()
    # Apply margins
    doc = SimpleDocTemplate(
        buffer, 
        pagesize=letter,
        rightMargin=30,
        leftMargin=30,
        topMargin=30,
        bottomMargin=18
    )
    
    data = [["Fecha", "Tipo", "Descripción", "Monto", "Categoría", "Cuenta", "Usuario", "Recibo"]]
    styles = getSampleStyleSheet()
    link_style = styles["BodyText"]
    link_style.alignment = 1 # Center

    for tx in transactions:
        receipt_cell = "-"
        if tx.get("receipt_url"):
            # Create a clickable link
            receipt_cell = Paragraph(f'<a href="{tx.get("receipt_url")}" color="blue">Ver</a>', link_style)

        data.append([
            tx.get("date")[:10], # Format YYYY-MM-DD
            tx.get("type"),
            Paragraph(tx.get("description") or "", styles['Normal']), # Use Paragraph for wrapping
            f"${tx.get('amount'):,.2f}",
            category_map.get(str(tx.get("category_id")), "-"),
            account_map.get(str(tx.get("account_id")), "-"),
            profile_map.get(str(tx.get("user_id")), "-"),
            receipt_cell
        ])

    table = Table(data, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"), # Center alignment for all cells
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), # Vertical center
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8), # Smaller font to fit columns
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
