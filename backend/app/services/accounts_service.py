from datetime import datetime
from typing import List, Optional
from app.services.base import BaseService
from app.repositories.accounts_repository import AccountsRepository

class AccountsService(BaseService):
    def __init__(self, repository: AccountsRepository):
        super().__init__(repository)

    async def get_my_accounts(self, user_id: str):
        profile_res = self.repository.get_user_profile(user_id)
        if not profile_res.data:
            return []
        
        family_id = profile_res.data[0].get('family_id')
        
        if not family_id:
            res = self.repository.get_accounts_by_user(user_id)
            return res.data or []

        res = self.repository.get_accounts_by_family(family_id)
        all_accounts = res.data or []

        return [
            acc for acc in all_accounts 
            if acc['type'] == 'joint' or (acc['type'] == 'personal' and acc['user_id'] == str(user_id))
        ]

    async def create_account(self, user_id: str, account_data: dict):
        profile_res = self.repository.get_user_profile(user_id)
        if not profile_res.data or not profile_res.data[0].get('family_id'):
             raise Exception("User does not belong to a family")
        
        family_id = profile_res.data[0]['family_id']
        
        data = {**account_data}
        data['family_id'] = family_id
        if data.get('type') == 'personal':
            data['user_id'] = str(user_id)
        else:
            data['user_id'] = None

        res = self.repository.create_account(data)
        if not res.data:
            raise Exception("Failed to create account")
        
        new_account = res.data[0]
        
        if new_account.get('balance', 0) > 0:
            tx_data = {
                "family_id": family_id,
                "user_id": str(user_id),
                "account_id": str(new_account['id']),
                "category_id": None,
                "description": "Saldo Inicial",
                "amount": new_account['balance'],
                "type": "income",
                "date": datetime.utcnow().isoformat()
            }
            self.repository.create_transaction(tx_data)
            
        return new_account
