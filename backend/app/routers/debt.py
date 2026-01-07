from fastapi import APIRouter, Depends, HTTPException
from typing import List
from app.dependencies import get_current_user
from app.models.debt import DebtCreate, DebtResponse
from app.db.supabase import supabase
from uuid import UUID
from datetime import datetime

router = APIRouter(prefix="/debts", tags=["debts"])

@router.get("/", response_model=List[DebtResponse])
async def get_debts(user = Depends(get_current_user)):
    profile_res = supabase.table("profiles").select("family_id").eq("id", user.id).execute()
    if not profile_res.data or not profile_res.data[0].get('family_id'):
        return []
    
    family_id = profile_res.data[0]['family_id']
    
    res = supabase.table("debts").select("*").eq("family_id", family_id).order("created_at", desc=True).execute()
    return res.data

@router.post("/", response_model=DebtResponse)
async def create_debt(debt: DebtCreate, user = Depends(get_current_user)):
    profile_res = supabase.table("profiles").select("family_id").eq("id", user.id).execute()
    if not profile_res.data or not profile_res.data[0].get('family_id'):
        raise HTTPException(status_code=400, detail="User not in a family")
    
    family_id = profile_res.data[0]['family_id']
    
    data = debt.model_dump()
    account_id = data.pop('account_id', None)
    data['family_id'] = family_id
    if data['due_date']:
        data['due_date'] = data['due_date'].isoformat()
    
    # Auto-assign default category if missing
    if not data.get('category_id'):
        default_cat_name = 'Préstamos Recibidos' if debt.type == 'to_pay' else 'Préstamos Otorgados'
        cat_res = supabase.table("categories").select("id").eq("name", default_cat_name).eq("is_default", True).execute()
        if cat_res.data:
            data['category_id'] = cat_res.data[0]['id']
    else:
        data['category_id'] = str(data['category_id'])
    
    res = supabase.table("debts").insert(data).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create debt")
    
    # 3. Create initial transaction if account_id is provided
    if account_id:
        tx_type = 'income' if debt.type == 'to_pay' else 'expense'
        impact = debt.total_amount if tx_type == 'income' else -debt.total_amount
        
        # Insert Transaction
        tx_data = {
            "family_id": family_id,
            "user_id": str(user.id),
            "account_id": str(account_id),
            "category_id": str(debt.category_id) if debt.category_id else None,
            "description": f"[{'PRESTAMO RECIBIDO' if debt.type == 'to_pay' else 'PRESTAMO OTORGADO'}] {debt.description}",
            "amount": debt.total_amount,
            "type": tx_type,
            "date": datetime.utcnow().isoformat()
        }
        supabase.table("transactions").insert(tx_data).execute()
        
        # Update Account Balance
        acc_res = supabase.table("accounts").select("balance").eq("id", str(account_id)).execute()
        if acc_res.data:
            new_balance = float(acc_res.data[0]['balance']) + impact
            supabase.table("accounts").update({"balance": new_balance}).eq("id", str(account_id)).execute()

    return res.data[0]

@router.patch("/{debt_id}", response_model=DebtResponse)
async def update_debt(debt_id: UUID, update_data: dict, user = Depends(get_current_user)):
    profile_res = supabase.table("profiles").select("family_id").eq("id", user.id).execute()
    family_id = profile_res.data[0].get('family_id')
    
    res = supabase.table("debts").update(update_data).eq("id", str(debt_id)).eq("family_id", family_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Debt not found or unauthorized")
    
    return res.data[0]

@router.delete("/{debt_id}")
async def delete_debt(debt_id: UUID, user = Depends(get_current_user)):
    profile_res = supabase.table("profiles").select("family_id").eq("id", user.id).execute()
    family_id = profile_res.data[0].get('family_id')
    
    supabase.table("debts").delete().eq("id", str(debt_id)).eq("family_id", family_id).execute()
    return {"status": "deleted"}
