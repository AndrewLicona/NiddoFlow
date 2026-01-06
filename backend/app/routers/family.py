from fastapi import APIRouter, Depends, HTTPException
from typing import List
from app.dependencies import get_current_user
from app.models.family import FamilyCreate, FamilyResponse
from app.db.supabase import supabase
from pydantic import BaseModel
import random
import string

router = APIRouter(prefix="/families", tags=["families"])

def generate_invite_code():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

@router.post("/", response_model=FamilyResponse)
async def create_family(family: FamilyCreate, user = Depends(get_current_user)):
    # 1. Create Family with invite code
    for _ in range(3):
        code = generate_invite_code()
        try:
             res = supabase.table("families").insert({"name": family.name, "invite_code": code}).execute()
             if res.data:
                 break
        except Exception:
             continue
    else:
         raise HTTPException(status_code=500, detail="Failed to generate unique invite code")

    new_family = res.data[0]

    # 2. Link User to Family (Update Profile)
    update_res = supabase.table("profiles").update({"family_id": new_family['id']}).eq("id", user.id).execute()
    
    if not update_res.data:
        raise HTTPException(status_code=500, detail="Failed to link family to user")

    return new_family

class JoinFamilyRequest(BaseModel):
    invite_code: str

@router.post("/join", response_model=FamilyResponse)
async def join_family(request: JoinFamilyRequest, user = Depends(get_current_user)):
    # 1. Find family by code
    res = supabase.table("families").select("*").eq("invite_code", request.invite_code).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Invalid invite code")
    
    family = res.data[0]
    
    # 2. Update User Profile
    supabase.table("profiles").update({"family_id": family['id']}).eq("id", user.id).execute()
    
    return family

@router.post("/leave", response_model=bool)
async def leave_family(user = Depends(get_current_user)):
    # 1. Update Profile to set family_id = null
    supabase.table("profiles").update({"family_id": None}).eq("id", user.id).execute()
    return True

@router.get("/members", response_model=List[dict])
async def get_family_members(user = Depends(get_current_user)):
    # 1. Get user profile to find family_id
    profile_res = supabase.table("profiles").select("family_id").eq("id", user.id).execute()
    if not profile_res.data:
         raise HTTPException(status_code=404, detail="Profile not found")
    
    family_id = profile_res.data[0].get('family_id')
    if not family_id:
        raise HTTPException(status_code=400, detail="User is not in a family")

    # 2. Get all profiles with that family_id
    members_res = supabase.table("profiles").select("id, full_name, email").eq("family_id", family_id).execute()
    return members_res.data

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
