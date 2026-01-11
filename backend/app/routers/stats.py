from fastapi import APIRouter, Depends, HTTPException
from typing import List, Dict
from datetime import datetime, timedelta
from app.dependencies import get_current_user
from app.db.supabase import supabase
from pydantic import BaseModel

router = APIRouter(prefix="/stats", tags=["stats"])

class TrendPoint(BaseModel):
    date: str
    income: float
    expense: float

class DashboardStats(BaseModel):
    total_balance: float
    monthly_income: float
    monthly_expense: float
    trends: List[TrendPoint]

@router.get("/dashboard", response_model=DashboardStats)
async def get_dashboard_stats(user = Depends(get_current_user)):
    # 1. Get Profile & Family
    profile_res = supabase.table("profiles").select("family_id").eq("id", user.id).execute()
    if not profile_res.data:
         raise HTTPException(status_code=404, detail="Profile not found")
    
    family_id = profile_res.data[0].get('family_id')
    
    # 2. Get Accounts Balance (Current Net Worth)
    acc_query = supabase.table("accounts").select("balance, type, user_id").eq("family_id", family_id)
    acc_res = acc_query.execute()
    accounts = acc_res.data or []
    
    total_balance = sum(
        acc['balance'] for acc in accounts 
        if acc['type'] == 'joint' or (acc['type'] == 'personal' and acc['user_id'] == str(user.id))
    )

    # 3. Monthly Stats (Current Month)
    today = datetime.utcnow()
    start_of_month = datetime(today.year, today.month, 1).isoformat()
    
    tx_res = supabase.table("transactions").select("amount, type").eq("family_id", family_id).gte("date", start_of_month).execute()
    monthly_txs = tx_res.data or []
    
    monthly_income = sum(t['amount'] for t in monthly_txs if t['type'] == 'income')
    monthly_expense = sum(t['amount'] for t in monthly_txs if t['type'] == 'expense')

    # 4. Trends (Last 6 Months) - This is where the optimization happens
    # Instead of sending all transactions, we'll aggregate them here roughly
    # (In a real production app, we'd use a Postgres VIEW or pre-aggregated table)
    six_months_ago = (today - timedelta(days=180)).isoformat()
    trend_res = supabase.table("transactions").select("amount, type, date").eq("family_id", family_id).gte("date", six_months_ago).execute()
    trend_txs = trend_res.data or []
    
    # Aggregate by month
    trends_map: Dict[str, Dict[str, float]] = {}
    for tx in trend_txs:
        month_key = tx['date'][:7] # YYYY-MM
        if month_key not in trends_map:
            trends_map[month_key] = {"income": 0, "expense": 0}
        
        if tx['type'] == 'income':
            trends_map[month_key]["income"] += tx['amount']
        elif tx['type'] == 'expense':
            trends_map[month_key]["expense"] += tx['amount']
    
    trends = [
        TrendPoint(date=k, income=v["income"], expense=v["expense"])
        for k, v in sorted(trends_map.items())
    ]

    return DashboardStats(
        total_balance=total_balance,
        monthly_income=monthly_income,
        monthly_expense=monthly_expense,
        trends=trends
    )
