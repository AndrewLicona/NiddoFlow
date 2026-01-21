from datetime import datetime
from typing import List, Optional, Dict
from app.services.base import BaseService
from app.repositories.transactions_repository import TransactionsRepository

class TransactionsService(BaseService):
    def __init__(self, repository: TransactionsRepository):
        super().__init__(repository)

    async def create_transaction(self, user_id: str, tx_data: dict):
        profile_res = self.repository.get_user_profile(user_id)
        if not profile_res.data or not profile_res.data[0].get('family_id'):
             raise Exception("User does not belong to a family")
        
        family_id = profile_res.data[0]['family_id']
        
        data = {**tx_data}
        data['user_id'] = str(user_id)
        data['family_id'] = family_id
        if isinstance(data.get('date'), datetime):
            data['date'] = data['date'].isoformat()
            
        res = self.repository.insert_transaction(data)
        if not res.data:
            raise Exception("Failed to create transaction")
        
        # Update Accounts
        amount = data['amount']
        impact = -amount if data['type'] in ['expense', 'transfer'] else amount
        
        await self._update_account_balance(data['account_id'], impact)

        if data['type'] == 'transfer' and data.get('target_account_id'):
            await self._update_account_balance(data['target_account_id'], amount)

        return res.data[0]

    async def get_transactions(self, user_id: str, scope: str = "family", start_date: str = None, end_date: str = None, limit: int = None):
        profile_res = self.repository.get_user_profile(user_id)
        if not profile_res.data or not profile_res.data[0].get('family_id'):
             return []
        
        family_id = profile_res.data[0]['family_id']
        
        transactions_data = []
        if scope == "personal":
            acc_res = self.repository.db.table("accounts").select("id").eq("user_id", str(user_id)).execute()
            personal_account_ids = [a['id'] for a in (acc_res.data or [])]
            if not personal_account_ids:
                return []
            
            res = self.repository.query_transactions({"account_id": personal_account_ids})
            transactions_data = res.data or []
        else:
            # Family Scope
            all_accounts_res = self.repository.get_accounts_by_family(family_id)
            all_accounts = all_accounts_res.data or []
            
            valid_account_ids = [acc['id'] for acc in all_accounts if not acc.get('user_id') or str(acc.get('user_id')) == str(user_id)]

            # 1. Transactions from allowed accounts
            tx_allowed = []
            if valid_account_ids:
                filters = {"account_id": valid_account_ids}
                # Date filtering needs to be handled in query_transactions or similar
                # For simplicity, I'll use the repository db directly for complex filters if needed
                query = self.repository.db.table("transactions").select("*").in_("account_id", valid_account_ids)
                if start_date: query = query.gte("date", start_date)
                if end_date: query = query.lte("date", end_date)
                tx_allowed = query.order("date", desc=True).execute().data or []

            # 2. Transfers for family
            query_transfers = self.repository.db.table("transactions").select("*").eq("family_id", family_id).eq("type", "transfer")
            if start_date: query_transfers = query_transfers.gte("date", start_date)
            if end_date: query_transfers = query_transfers.lte("date", end_date)
            tx_transfers = query_transfers.order("date", desc=True).execute().data or []

            # 3. Merge
            combined = {t['id']: t for t in tx_allowed}
            for t in tx_transfers:
                combined[t['id']] = t
                
            transactions_data = list(combined.values())
            transactions_data.sort(key=lambda x: x['date'], reverse=True)
            if limit:
                transactions_data = transactions_data[:limit]

        return await self._enrich_transactions(family_id, transactions_data)

    async def update_transaction(self, user_id: str, transaction_id: str, updates: dict):
        profile_res = self.repository.get_user_profile(user_id)
        family_id = profile_res.data[0]['family_id']

        old_tx_res = self.repository.get_transaction_by_id(transaction_id)
        if not old_tx_res.data:
            raise Exception("Transaction not found")
        
        old_tx = old_tx_res.data[0]
        if str(old_tx['family_id']) != str(family_id):
            raise Exception("Not authorized")

        # Reverse Old Impact
        old_impact = -old_tx['amount'] if old_tx['type'] in ['expense', 'transfer'] else old_tx['amount']
        await self._update_account_balance(old_tx['account_id'], -old_impact)
        if old_tx['type'] == 'transfer' and old_tx.get('target_account_id'):
            await self._update_account_balance(old_tx['target_account_id'], -old_tx['amount'])

        # Prepare Updates
        data = {**updates}
        if 'date' in data and isinstance(data['date'], datetime):
            data['date'] = data['date'].isoformat()
        
        new_tx_state = {**old_tx, **data}
        
        # Apply New Impact
        new_impact = -new_tx_state['amount'] if new_tx_state['type'] in ['expense', 'transfer'] else new_tx_state['amount']
        await self._update_account_balance(new_tx_state['account_id'], new_impact)
        if new_tx_state['type'] == 'transfer' and new_tx_state.get('target_account_id'):
            await self._update_account_balance(new_tx_state['target_account_id'], new_tx_state['amount'])

        res = self.repository.update_transaction(transaction_id, data)
        return res.data[0]

    async def delete_transaction(self, user_id: str, transaction_id: str):
        profile_res = self.repository.get_user_profile(user_id)
        family_id = profile_res.data[0]['family_id']

        tx_res = self.repository.get_transaction_by_id(transaction_id)
        if not tx_res.data:
            raise Exception("Transaction not found")
        
        transaction = tx_res.data[0]
        if str(transaction['family_id']) != str(family_id):
            raise Exception("Not authorized")

        impact = -transaction['amount'] if transaction['type'] in ['expense', 'transfer'] else transaction['amount']
        await self._update_account_balance(transaction['account_id'], -impact)
        if transaction['type'] == 'transfer' and transaction.get('target_account_id'):
            await self._update_account_balance(transaction['target_account_id'], -transaction['amount'])

        self.repository.delete_transaction(transaction_id)
        return True

    async def _update_account_balance(self, account_id: str, delta: float):
        acc_res = self.repository.get_account_by_id(account_id)
        if acc_res.data:
            new_balance = acc_res.data[0]['balance'] + delta
            self.repository.update_account_balance(account_id, new_balance)

    async def _enrich_transactions(self, family_id: str, transactions: List[Dict]):
        if not transactions: return []
        
        cat_res = self.repository.get_categories(family_id)
        acc_res = self.repository.get_accounts_by_family(family_id)
        user_ids = list(set([str(t['user_id']) for t in transactions if t.get('user_id')]))
        prof_res = self.repository.get_profiles_by_ids(user_ids)

        category_map = {str(c['id']): c['name'] for c in (cat_res.data or [])}
        account_map = {str(a['id']): a['name'] for a in (acc_res.data or [])}
        profile_map = {str(p['id']): p['full_name'] for p in (prof_res.data or [])}

        for t in transactions:
            t['category_name'] = category_map.get(str(t.get('category_id')))
            t['account_name'] = account_map.get(str(t.get('account_id')))
            t['user_name'] = profile_map.get(str(t.get('user_id')))
        
        return transactions
