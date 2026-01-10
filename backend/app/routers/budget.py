from fastapi import APIRouter, Depends, HTTPException
from typing import List
from app.dependencies import get_current_user
from app.models.budget import BudgetCreate, BudgetResponse
from app.db.supabase import supabase
from uuid import UUID

router = APIRouter(prefix="/budgets", tags=["budgets"])

@router.get("/", response_model=List[BudgetResponse])
async def get_budgets(scope: str = "family", user = Depends(get_current_user)):
    # Get family_id
    profile_res = supabase.table("profiles").select("family_id").eq("id", user.id).execute()
    if not profile_res.data or not profile_res.data[0].get('family_id'):
        return []
    
    family_id = profile_res.data[0]['family_id']
    
    query = supabase.table("budgets").select("*").eq("family_id", family_id)
    
    if scope == "personal":
        # Only budgets assigned to this user
        query = query.eq("user_id", user.id)
    else:
        # Family budgets (user_id is null) AND my personal budgets? 
        # Or just Family Budgets? Usually "Family Budget" implies shared.
        # Let's say Family Scope = Shared Budgets (user_id is null)
        # If user wants to see everything, they might need a different view, but let's stick to separation.
        # Requirement: "crear presupuestos personales".
        # Let's show Global (user_id is null) + Mine (user_id = me) in Family view?
        # Or strict separation? 
        # Let's try: Family Scope = All Shared (user_id is null)
        # Personal Scope = Mine
        # But wait, usually you want to see your contribution to the family.
        # Let's implement strict separation for now as per "personal budgets" implies privacy.
        # "todos deberian ver las transacciones entre cuentas" was about transactions.
        
        # Family View: Show only budgets that are explicitly "Family" (no user_id)
        query = query.is_("user_id", "null")

    res = query.execute()
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
    
    # Handle user_id (Personal vs Family)
    if data.get('user_id'):
        data['user_id'] = str(data['user_id'])
    else:
        data['user_id'] = None

    # Upsert logic needs to account for user_id now?
    # The unique constraint in DB might be (family_id, category_id, period, etc).
    # If we add user_id, the constraint should probably include it or be separate.
    # Current code assumes `on_conflict` string matches an index.
    # We might fail on upsert if the index doesn't include user_id.
    # For now, let's try simple insert or update without complex on_conflict if index isn't ready.
    # Or, assuming migration didn't add index, we rely on Supabase/Postgres primary key or check existing.
    
    # Check if exists first to avoid index issues if we didn't update unique constraint
    query = supabase.table("budgets").select("id").eq("family_id", family_id)
    if data['category_id']:
        query = query.eq("category_id", data['category_id'])
    else:
        query = query.is_("category_id", "null")
        
    query = query.eq("period", data['period']).eq("year", data['year'])
    if data['month']: query = query.eq("month", data['month'])
    if data['week_number']: query = query.eq("week_number", data['week_number'])
    
    # Check user_id match
    if data['user_id']:
        query = query.eq("user_id", data['user_id'])
    else:
        query = query.is_("user_id", "null")

    existing = query.execute()
    
    if existing.data:
        # Update
        res = supabase.table("budgets").update(data).eq("id", existing.data[0]['id']).execute()
    else:
        # Insert
        res = supabase.table("budgets").insert(data).execute()
        
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create/update budget")
    
    return res.data[0]

@router.delete("/{budget_id}")
async def delete_budget(budget_id: UUID, user = Depends(get_current_user)):
    # Security: check if budget belongs to user's family
    profile_res = supabase.table("profiles").select("family_id").eq("id", user.id).execute()
    family_id = profile_res.data[0].get('family_id')
    
    res = supabase.table("budgets").delete().eq("id", str(budget_id)).eq("family_id", family_id).execute()
    return {"status": "deleted"}
