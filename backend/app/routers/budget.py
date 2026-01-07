from fastapi import APIRouter, Depends, HTTPException
from typing import List
from app.dependencies import get_current_user
from app.models.budget import BudgetCreate, BudgetResponse
from app.db.supabase import supabase
from uuid import UUID

router = APIRouter(prefix="/budgets", tags=["budgets"])

@router.get("/", response_model=List[BudgetResponse])
async def get_budgets(user = Depends(get_current_user)):
    # Get family_id
    profile_res = supabase.table("profiles").select("family_id").eq("id", user.id).execute()
    if not profile_res.data or not profile_res.data[0].get('family_id'):
        return []
    
    family_id = profile_res.data[0]['family_id']
    
    res = supabase.table("budgets").select("*").eq("family_id", family_id).execute()
    return res.data

@router.post("/", response_model=BudgetResponse)
async def create_budget(budget: BudgetCreate, user = Depends(get_current_user)):
    profile_res = supabase.table("profiles").select("family_id").eq("id", user.id).execute()
    if not profile_res.data or not profile_res.data[0].get('family_id'):
        raise HTTPException(status_code=400, detail="User not in a family")
    
    family_id = profile_res.data[0]['family_id']
    
    data = budget.model_dump()
    data['family_id'] = family_id
    if data['category_id']:
        data['category_id'] = str(data['category_id'])
    if data['start_date']:
        data['start_date'] = data['start_date'].isoformat()
    if data['end_date']:
        data['end_date'] = data['end_date'].isoformat()
    
    res = supabase.table("budgets").insert(data).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create budget")
    
    return res.data[0]

@router.delete("/{budget_id}")
async def delete_budget(budget_id: UUID, user = Depends(get_current_user)):
    # Security: check if budget belongs to user's family
    profile_res = supabase.table("profiles").select("family_id").eq("id", user.id).execute()
    family_id = profile_res.data[0].get('family_id')
    
    res = supabase.table("budgets").delete().eq("id", str(budget_id)).eq("family_id", family_id).execute()
    return {"status": "deleted"}
