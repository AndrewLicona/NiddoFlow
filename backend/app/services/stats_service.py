from datetime import datetime, timedelta
from typing import List, Dict
from app.services.base import BaseService
from app.repositories.stats_repository import StatsRepository

class StatsService(BaseService):
    def __init__(self, repository: StatsRepository):
        super().__init__(repository)

    async def get_dashboard_summary(self, user_id: str):
        # 1. Get Profile & Family
        profile_res = self.repository.get_user_profile(user_id)
        if not profile_res.data:
            return None
        
        family_id = profile_res.data[0].get('family_id')
        
        # 2. Get Accounts Balance
        acc_res = self.repository.get_family_accounts(family_id)
        accounts = acc_res.data or []
        
        total_balance = sum(
            acc['balance'] for acc in accounts 
            if acc['type'] == 'joint' or (acc['type'] == 'personal' and acc['user_id'] == str(user_id))
        )

        # 3. Monthly Stats
        today = datetime.utcnow()
        start_of_month = datetime(today.year, today.month, 1).isoformat()
        
        tx_res = self.repository.get_monthly_transactions(family_id, start_of_month)
        monthly_txs = tx_res.data or []
        
        monthly_income = sum(t['amount'] for t in monthly_txs if t['type'] == 'income')
        monthly_expense = sum(t['amount'] for t in monthly_txs if t['type'] == 'expense')

        # 4. Trends (Last 6 Months)
        six_months_ago = (today - timedelta(days=180)).isoformat()
        trend_res = self.repository.get_trend_transactions(family_id, six_months_ago)
        trend_txs = trend_res.data or []
        
        trends_map: Dict[str, Dict[str, float]] = {}
        for tx in trend_txs:
            month_key = tx['date'][:7]
            if month_key not in trends_map:
                trends_map[month_key] = {"income": 0, "expense": 0}
            
            if tx['type'] == 'income':
                trends_map[month_key]["income"] += tx['amount']
            elif tx['type'] == 'expense':
                trends_map[month_key]["expense"] += tx['amount']
        
        trends = [
            {"date": k, "income": v["income"], "expense": v["expense"]}
            for k, v in sorted(trends_map.items())
        ]

        return {
            "total_balance": total_balance,
            "monthly_income": monthly_income,
            "monthly_expense": monthly_expense,
            "trends": trends
        }
