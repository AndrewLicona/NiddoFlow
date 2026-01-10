from fastapi import APIRouter, Depends, HTTPException
from typing import List
from app.dependencies import get_current_user
from app.models.account import AccountCreate, AccountResponse
from app.db.supabase import supabase
from datetime import datetime

router = APIRouter(prefix="/accounts", tags=["accounts"])

@router.post("/", response_model=AccountResponse)
async def create_account(account: AccountCreate, user = Depends(get_current_user)):
    # 1. Get User Profile to find Family ID
    profile_res = supabase.table("profiles").select("family_id").eq("id", user.id).execute()
    if not profile_res.data or not profile_res.data[0].get('family_id'):
         raise HTTPException(status_code=400, detail="User does not belong to a family")
    
    family_id = profile_res.data[0]['family_id']

    # 2. Prepare data
    data = account.model_dump()
    data['family_id'] = family_id
    if account.type == 'personal':
        data['user_id'] = str(user.id)
    else:
        data['user_id'] = None # Joint accounts might not have a single owner, or maybe they do? Let's leave None for now.

    res = supabase.table("accounts").insert(data).execute()
    
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create account")
    
    account_id = res.data[0]['id']
    
    # 3. Create "Saldo Inicial" transaction if balance > 0
    if account.balance > 0:
        tx_data = {
            "family_id": family_id,
            "user_id": str(user.id),
            "account_id": str(account_id),
            "category_id": None, # Could be a specific "Adjustment" category if we had one
            "description": "Saldo Inicial",
            "amount": account.balance,
            "type": "income",
            "date": datetime.utcnow().isoformat()
        }
        supabase.table("transactions").insert(tx_data).execute()
        
    return res.data[0]

@router.get("/", response_model=List[AccountResponse])
async def get_my_accounts(user = Depends(get_current_user)):
    # Get user profile to find family_id
    profile_res = supabase.table("profiles").select("family_id").eq("id", user.id).execute()
    if not profile_res.data:
         raise HTTPException(status_code=404, detail="Profile not found")
    
    family_id = profile_res.data[0].get('family_id')
    
    # Get accounts (Personal for this user OR Joint for this family)
    # Supabase-py doesn't support complex OR queries easily in one go for "user_id=X OR family_id=Y AND type=joint" without raw SQL or builder
    # Simplified: Get all accounts for the family
    if not family_id:
        # Only personal accounts if no family
        res = supabase.table("accounts").select("*").eq("user_id", user.id).execute()
        return res.data

    res = supabase.table("accounts").select("*").eq("family_id", family_id).execute()
    all_accounts = res.data

    # Filter: Show Joint accounts OR Personal accounts belonging to this user
    filtered_accounts = [
        acc for acc in all_accounts 
        if acc['type'] == 'joint' or (acc['type'] == 'personal' and acc['user_id'] == str(user.id))
    ]
    
    return filtered_accounts
