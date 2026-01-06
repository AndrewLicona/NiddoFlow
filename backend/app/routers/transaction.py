from fastapi import APIRouter, Depends, HTTPException
from typing import List
from app.dependencies import get_current_user
from app.models.transaction import TransactionCreate, TransactionResponse
from app.db.supabase import supabase

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
    # Ensure date is string for JSON serialization if needed, but Supabase client handles datetime usually.
    # Pydantic model_dump keeps it as datetime object.
    data['date'] = data['date'].isoformat()
    data['category_id'] = str(data['category_id']) if data['category_id'] else None
    data['account_id'] = str(data['account_id'])

    res = supabase.table("transactions").insert(data).execute()
    
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create transaction")
    
    # 3. Update Account Balance
    # Fetch current account to get balance (optional if we trust concurrent updates, but let's be safe-ish)
    # Actually, we can just increment/decrement.
    amount = transaction.amount
    if transaction.type == 'expense':
        amount = -amount
    elif transaction.type == 'transfer':
        # TODO: Handle transfer logic (deduct from account_id, add to destination?)
        # For now treat as expense from this account perspective if no destination
        amount = -amount

    # RPC for atomic update would be better, but simple update for now:
    # We need to fetch current balance first because Supabase-py doesn't have easy "increment" without RPC.
    account_res = supabase.table("accounts").select("balance").eq("id", data['account_id']).execute()
    if account_res.data:
        current_balance = account_res.data[0]['balance']
        new_balance = current_balance + amount
        supabase.table("accounts").update({"balance": new_balance}).eq("id", data['account_id']).execute()


    return res.data[0]

@router.get("/", response_model=List[TransactionResponse])
async def get_transactions(user = Depends(get_current_user)):
    # 1. Get Family ID
    profile_res = supabase.table("profiles").select("family_id").eq("id", user.id).execute()
    if not profile_res.data or not profile_res.data[0].get('family_id'):
         return []
    
    family_id = profile_res.data[0]['family_id']

    # 2. Fetch Transactions for Family
    res = supabase.table("transactions").select("*").eq("family_id", family_id).order("date", desc=True).execute()
    transactions_data = res.data or []
    
    if not transactions_data:
        return []

    # 3. Fetch auxiliary data for mapping (Categories, Accounts, Profiles)
    # We fetch both default categories (family_id is null) and family-specific categories
    cat_res = supabase.table("categories").select("id, name").or_(f"family_id.eq.{family_id},is_default.eq.true").execute()
    acc_res = supabase.table("accounts").select("id, name").eq("family_id", family_id).execute()
    
    # Fetch profiles that are referenced in these transactions
    user_ids = list(set([str(t['user_id']) for t in transactions_data if t.get('user_id')]))
    prof_res = supabase.table("profiles").select("id, full_name").in_("id", user_ids).execute()

    # Create lookup maps
    category_map = {str(c['id']): c['name'] for c in (cat_res.data or [])}
    account_map = {str(a['id']): a['name'] for a in (acc_res.data or [])}
    profile_map = {str(p['id']): p['full_name'] for p in (prof_res.data or [])}

    # 4. Map names to transactions
    for t in transactions_data:
        t['category_name'] = category_map.get(str(t.get('category_id')))
        t['account_name'] = account_map.get(str(t.get('account_id')))
        t['user_name'] = profile_map.get(str(t.get('user_id')))

    return transactions_data
