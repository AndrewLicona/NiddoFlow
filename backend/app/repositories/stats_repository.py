from datetime import datetime, timedelta
from app.repositories.base import BaseRepository

class StatsRepository(BaseRepository):
    def get_family_accounts(self, family_id: str):
        return self.db.table("accounts").select("balance, type, user_id").eq("family_id", family_id).execute()

    def get_monthly_transactions(self, family_id: str, start_date: str):
        return self.db.table("transactions").select("amount, type").eq("family_id", family_id).gte("date", start_date).execute()

    def get_trend_transactions(self, family_id: str, start_date: str):
        return self.db.table("transactions").select("amount, type, date").eq("family_id", family_id).gte("date", start_date).execute()

    def get_user_profile(self, user_id: str):
        return self.db.table("profiles").select("family_id").eq("id", user_id).execute()
