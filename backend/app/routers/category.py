from fastapi import APIRouter, Depends
from typing import List
from app.dependencies import get_current_user
from app.models.category import CategoryResponse
from app.db.supabase import supabase

router = APIRouter(prefix="/categories", tags=["categories"])

@router.get("/", response_model=List[CategoryResponse])
async def get_categories(user = Depends(get_current_user)):
    # 1. Get Family ID
    profile_res = supabase.table("profiles").select("family_id").eq("id", user.id).execute()
    family_id = profile_res.data[0].get('family_id') if profile_res.data else None

    # 2. Fetch Categories (Default OR Belongs to Family)
    # Supabase "or" syntax: type.eq.official,name.eq.Stadium
    # We want: is_default.eq.true,family_id.eq.{family_id}
    # But filtering matching ANY is .or_()
    
    query = supabase.table("categories").select("*")
    
    if family_id:
        query = query.or_(f"is_default.eq.true,family_id.eq.{family_id}")
    else:
        query = query.eq("is_default", True)
        
    res = query.execute()
    return res.data
