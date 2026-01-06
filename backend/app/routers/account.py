from fastapi import APIRouter, Depends, HTTPException
from typing import List
from app.dependencies import get_current_user
from app.models.account import AccountCreate, AccountResponse
from app.db.supabase import supabase

router = APIRouter(prefix="/accounts", tags=["accounts"])

@router.post("/", response_model=AccountResponse)
async def create_account(account: AccountCreate, user = Depends(get_current_user)):
    res = supabase.table("accounts").insert(account.model_dump()).execute()
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
    # Filter in python if needed, or refine query
    return res.data
