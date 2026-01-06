from fastapi import APIRouter, Depends, HTTPException
from typing import List
from app.dependencies import get_current_user
from app.models.family import FamilyCreate, FamilyResponse
from app.db.supabase import supabase

router = APIRouter(prefix="/families", tags=["families"])

@router.post("/", response_model=FamilyResponse)
async def create_family(family: FamilyCreate, user = Depends(get_current_user)):
    # 1. Create Family
    res = supabase.table("families").insert({"name": family.name}).execute()
    new_family = res.data[0]
    print(f"DEBUG: Created family {new_family['id']} for user {user.id}")

    # Check if profile exists
    check_profile = supabase.table("profiles").select("*").eq("id", user.id).execute()
    print(f"DEBUG: Profile check data: {check_profile.data}")
    
    if not check_profile.data:
        # Profile might disappear if trigger failed or RLS hidden it? 
        # But we are using Service Role Key (hopefully), so we should see everything.
        # Let's try to create it manually just in case
        print("DEBUG: Profile not found, creating one...")
        supabase.table("profiles").insert({"id": user.id, "email": user.email}).execute()

    # 2. Update User Profile with family_id
    update_res = supabase.table("profiles").update({"family_id": new_family['id']}).eq("id", user.id).execute()
    print(f"DEBUG: Update result: {update_res.data}")

    if not update_res.data:
        raise HTTPException(status_code=500, detail="Failed to link family to user")

    return new_family

@router.get("/", response_model=List[FamilyResponse])
async def get_my_family(user = Depends(get_current_user)):
    # Get user profile to find family_id
    profile_res = supabase.table("profiles").select("family_id").eq("id", user.id).execute()
    if not profile_res.data:
         raise HTTPException(status_code=404, detail="Profile not found")
    
    family_id = profile_res.data[0].get('family_id')
    if not family_id:
        return []

    family_res = supabase.table("families").select("*").eq("id", family_id).execute()
    return family_res.data
