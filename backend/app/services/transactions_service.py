from datetime import datetime
from typing import List, Optional, Dict
from app.services.base import BaseService
from app.repositories.transactions_repository import TransactionsRepository

class TransactionsService(BaseService):
    def __init__(self, repository: TransactionsRepository):
        super().__init__(repository)

    async def create_transaction(self, user_id: str, tx_data: dict):
        profile_res = await self.repository.get_user_profile(user_id)
        if not profile_res.data or not profile_res.data[0].get('family_id'):
             raise Exception("User does not belong to a family")

        family_id = profile_res.data[0]['family_id']

        data = {**tx_data}
        items = data.pop('items', [])
        data['user_id'] = str(user_id)
        data['family_id'] = str(family_id)

        # Convert all UUID fields to string for Supabase serialization
        for key in ['account_id', 'category_id', 'target_account_id']:
            if data.get(key):
                data[key] = str(data[key])

        if isinstance(data.get('date'), datetime):
            data['date'] = data['date'].isoformat()

        res = await self.repository.insert_transaction(data)
        if not res.data:
            raise Exception("Failed to create transaction")

        created_tx = res.data[0]
        tx_id = created_tx.get('id')

        # Save items if any
        saved_items = []
        if items and tx_id:
            for item in items:
                item_dict = item if isinstance(item, dict) else item.model_dump()
                item_res = await self.repository.insert_transaction_item({
                    "transaction_id": str(tx_id),
                    "item_name": item_dict.get('item_name') or item_dict.get('itemName'),
                    "quantity": item_dict.get('quantity', 1.0),
                    "unit_price": item_dict.get('unit_price') or item_dict.get('unitPrice', 0),
                    "total_price": item_dict.get('total_price') or item_dict.get('totalPrice', 0),
                    "category": item_dict.get('category')
                })
                if item_res:
                    if hasattr(item_res, 'dict'):
                        saved_items.append(item_res.dict())
                    elif isinstance(item_res, dict):
                        saved_items.append(item_res)

        if isinstance(created_tx.get('date'), datetime):
            created_tx['date'] = created_tx['date'].isoformat()

        created_tx['items'] = saved_items
        return created_tx

    async def get_transactions(self, user_id: str, scope: str = "family", start_date: str = None, end_date: str = None, limit: int = None):
        profile_res = await self.repository.get_user_profile(user_id)
        if not profile_res.data or not profile_res.data[0].get('family_id'):
             return []

        family_id = profile_res.data[0]['family_id']

        if scope == "personal":
            accounts = await self.repository.prisma.account.find_many(where={"user_id": user_id})
            valid_account_ids = [a.id for a in accounts]
        else:
            all_accounts_res = await self.repository.get_accounts_by_family(family_id)
            all_accounts = all_accounts_res.data or []
            valid_account_ids = [acc['id'] for acc in all_accounts if not acc.get('user_id') or str(acc.get('user_id')) == str(user_id)]

        if not valid_account_ids:
            return []

        tx_data = await self.repository.get_transactions_prisma(family_id, valid_account_ids, start_date, end_date, limit)

        if scope != "personal":
            transfers = await self.repository.get_transfers_prisma(family_id, start_date, end_date)
            combined = {str(t.id): t for t in tx_data}
            for t in transfers:
                combined[str(t.id)] = t

            transactions_data = list(combined.values())
            transactions_data.sort(key=lambda x: x.date, reverse=True)
            if limit:
                transactions_data = transactions_data[:limit]
        else:
            transactions_data = tx_data

        user_ids = list(set([str(t.user_id) for t in transactions_data if t.user_id]))
        prof_res = await self.repository.get_profiles_by_ids(user_ids) if user_ids else None
        profile_map = {str(p['id']): p['full_name'] for p in (prof_res.data if prof_res else [])}

        enriched = []
        for t in transactions_data:
            tx_dict = t.model_dump() if hasattr(t, 'model_dump') else dict(t)
            tx_dict['category_name'] = t.category.name if getattr(t, 'category', None) else None
            tx_dict['account_name'] = t.account.name if getattr(t, 'account', None) else None
            tx_dict['user_name'] = profile_map.get(str(t.user_id))
            if getattr(t, 'items', None):
                tx_dict['items'] = [item.model_dump() if hasattr(item, 'model_dump') else dict(item) for item in t.items]
            else:
                tx_dict['items'] = []

            if isinstance(tx_dict['date'], datetime):
                tx_dict['date'] = tx_dict['date'].isoformat()
            enriched.append(tx_dict)

        return enriched

    async def update_transaction(self, user_id: str, transaction_id: str, updates: dict):
        profile_res = await self.repository.get_user_profile(user_id)
        family_id = profile_res.data[0]['family_id']

        old_tx_res = await self.repository.get_transaction_by_id(transaction_id)
        if not old_tx_res.data:
            raise Exception("Transaction not found")

        old_tx = old_tx_res.data[0]
        if str(old_tx['family_id']) != str(family_id):
            raise Exception("Not authorized")

        data = {**updates}
        items = data.pop('items', None)

        for key in ['account_id', 'category_id', 'target_account_id']:
            if data.get(key):
                data[key] = str(data[key])

        if 'date' in data and isinstance(data['date'], datetime):
            data['date'] = data['date'].isoformat()

        res = await self.repository.update_transaction(transaction_id, data)
        if not res.data:
            raise Exception("Failed to update transaction")

        updated_tx = res.data[0]

        if items is not None:
            await self.repository.delete_transaction_items(transaction_id)
            saved_items = []
            for item in items:
                item_dict = item if isinstance(item, dict) else item.model_dump()
                item_res = await self.repository.insert_transaction_item({
                    "transaction_id": str(transaction_id),
                    "item_name": item_dict.get('item_name') or item_dict.get('itemName'),
                    "quantity": item_dict.get('quantity', 1.0),
                    "unit_price": item_dict.get('unit_price') or item_dict.get('unitPrice', 0),
                    "total_price": item_dict.get('total_price') or item_dict.get('totalPrice', 0),
                    "category": item_dict.get('category')
                })
                if item_res:
                    if hasattr(item_res, 'dict'):
                        saved_items.append(item_res.dict())
                    elif isinstance(item_res, dict):
                        saved_items.append(item_res)
            updated_tx['items'] = saved_items

        if isinstance(updated_tx.get('date'), datetime):
            updated_tx['date'] = updated_tx['date'].isoformat()
        return updated_tx

    async def delete_transaction(self, user_id: str, transaction_id: str):
        profile_res = await self.repository.get_user_profile(user_id)
        family_id = profile_res.data[0]['family_id']

        tx_res = await self.repository.get_transaction_by_id(transaction_id)
        if not tx_res.data:
            raise Exception("Transaction not found")

        transaction = tx_res.data[0]
        if str(transaction['family_id']) != str(family_id):
            raise Exception("Not authorized")

        await self.repository.delete_transaction(transaction_id)
        return True
