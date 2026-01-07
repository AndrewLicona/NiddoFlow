from fastapi import APIRouter, Depends, HTTPException
from typing import List
from app.dependencies import get_current_user
from app.models.transaction import TransactionCreate, TransactionResponse, TransactionUpdate
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
    data['date'] = data['date'].isoformat()
    data['category_id'] = str(data['category_id']) if data['category_id'] else None
    data['account_id'] = str(data['account_id'])

    res = supabase.table("transactions").insert(data).execute()
    
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create transaction")
    
    # 3. Update Account Balance
    amount = transaction.amount
    if transaction.type == 'expense' or transaction.type == 'transfer':
        impact = -amount
    else:
        impact = amount

    account_res = supabase.table("accounts").select("balance").eq("id", data['account_id']).execute()
    if account_res.data:
        current_balance = account_res.data[0]['balance']
        new_balance = current_balance + impact
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

    # Reverse Old Impact
    old_impact = -old_tx['amount'] if old_tx['type'] in ['expense', 'transfer'] else old_tx['amount']
    old_acc_res = supabase.table("accounts").select("balance").eq("id", old_tx['account_id']).execute()
    if old_acc_res.data:
        supabase.table("accounts").update({
            "balance": old_acc_res.data[0]['balance'] - old_impact
        }).eq("id", old_tx['account_id']).execute()

    # Prepare Updates
    update_data = updates.model_dump(exclude_unset=True)
    if 'date' in update_data:
        update_data['date'] = update_data['date'].isoformat()
    if 'category_id' in update_data:
        update_data['category_id'] = str(update_data['category_id']) if update_data['category_id'] else None
    if 'account_id' in update_data:
        update_data['account_id'] = str(update_data['account_id'])

    new_tx_state = {**old_tx, **update_data}
    
    # Apply New Impact
    new_impact = -new_tx_state['amount'] if new_tx_state['type'] in ['expense', 'transfer'] else new_tx_state['amount']
    new_acc_res = supabase.table("accounts").select("balance").eq("id", new_tx_state['account_id']).execute()
    if new_acc_res.data:
        supabase.table("accounts").update({
            "balance": new_acc_res.data[0]['balance'] + new_impact
        }).eq("id", new_tx_state['account_id']).execute()

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

    supabase.table("transactions").delete().eq("id", transaction_id).execute()
    return {"status": "success", "message": "Transaction deleted"}
