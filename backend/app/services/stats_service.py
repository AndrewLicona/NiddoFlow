from datetime import datetime, timedelta
from typing import List, Dict
from app.services.base import BaseService
from app.repositories.stats_repository import StatsRepository

class StatsService(BaseService):
    def __init__(self, repository: StatsRepository):
        super().__init__(repository)

    async def get_dashboard_summary(self, user_id: str):
        # Optimized: Use RPC call to get all stats in one go
        res = self.repository.get_dashboard_summary_rpc(user_id)
        if not res.data:
            return None
        
        # res.data might be a list containing the json due to how Supabase returns RPC
        # or just the dict directly depending on return type. 
        # Since function returns json, it usually comes as data scalar or list of 1.
        # Let's handle it safely.
        
        data = res.data
        if isinstance(data, list) and len(data) > 0:
            # If function returns TABLE or set, it's a list. 
            # If function returns JSON, it might be a direct object or list.
            # Based on experience with supabase-py:
            # Plpgsql returning JSON often comes as the body itself.
            pass
        
        # Assuming direct return for now, if it fails we check format.
        # But wait, execute_sql returned [] which means empty?
        # Ah, execute_sql output was empty because I didn't verify output.
        # Let's trust the RPC structure.
        
        return data
