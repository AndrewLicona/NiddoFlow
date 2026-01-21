from datetime import datetime
from typing import List, Optional
from app.services.base import BaseService
from app.repositories.debts_repository import DebtsRepository

class DebtsService(BaseService):
    def __init__(self, repository: DebtsRepository):
        super().__init__(repository)

    async def get_debts(self, user_id: str):
        profile_res = self.repository.get_user_profile(user_id)
        if not profile_res.data or not profile_res.data[0].get('family_id'):
            return []
        
        family_id = profile_res.data[0]['family_id']
        res = self.repository.get_debts_by_family(family_id)
        return res.data or []

    async def create_debt(self, user_id: str, debt_data: dict):
        profile_res = self.repository.get_user_profile(user_id)
        if not profile_res.data or not profile_res.data[0].get('family_id'):
            raise Exception("User not in a family")
        
        family_id = profile_res.data[0]['family_id']
        
        data = {**debt_data}
        data['family_id'] = family_id
        if data.get('due_date') and isinstance(data['due_date'], datetime):
            data['due_date'] = data['due_date'].isoformat()
        
        # Auto-assign category
        if not data.get('category_id'):
            default_name = 'Préstamos Recibidos' if data.get('type') == 'to_pay' else 'Préstamos Otorgados'
            cat_res = self.repository.get_default_category(default_name)
            if cat_res.data:
                data['category_id'] = cat_res.data[0]['id']

        res = self.repository.insert_debt(data)
        if not res.data:
            raise Exception("Failed to create debt")
        
        new_debt = res.data[0]
        account_id = data.get('account_id')
        
        if account_id:
            tx_type = 'income' if new_debt['type'] == 'to_pay' else 'expense'
            impact = new_debt['total_amount'] if tx_type == 'income' else -new_debt['total_amount']
            
            # Create Transaction
            tx_data = {
                "family_id": family_id,
                "user_id": str(user_id),
                "account_id": str(account_id),
                "category_id": str(new_debt['category_id']) if new_debt.get('category_id') else None,
                "description": f"[{'PRESTAMO RECIBIDO' if new_debt['type'] == 'to_pay' else 'PRESTAMO OTORGADO'}] {new_debt['description']}",
                "amount": new_debt['total_amount'],
                "type": tx_type,
                "date": datetime.utcnow().isoformat()
            }
            self.repository.insert_transaction(tx_data)
            
            # Update Account
            acc_res = self.repository.get_account_balance(str(account_id))
            if acc_res.data:
                new_balance = float(acc_res.data[0]['balance']) + impact
                self.repository.update_account_balance(str(account_id), new_balance)

        return new_debt

    async def update_debt(self, user_id: str, debt_id: str, updates: dict):
        profile_res = self.repository.get_user_profile(user_id)
        family_id = profile_res.data[0].get('family_id')
        res = self.repository.update_debt(debt_id, family_id, updates)
        if not res.data:
            raise Exception("Debt not found or unauthorized")
        return res.data[0]

    async def delete_debt(self, user_id: str, debt_id: str):
        profile_res = self.repository.get_user_profile(user_id)
        family_id = profile_res.data[0].get('family_id')
        self.repository.delete_debt(debt_id, family_id)
        return True

    async def pay_debt(self, user_id: str, debt_id: str, payment_data: dict):
        profile_res = self.repository.get_user_profile(user_id)
        if not profile_res.data or not profile_res.data[0].get('family_id'):
            raise Exception("User not in a family")
        
        family_id = profile_res.data[0]['family_id']
        amount = float(payment_data['amount'])
        account_id = payment_data['accountId']
        category_id = payment_data.get('categoryId')
        description = payment_data.get('description')
        debt_type = payment_data['type']
        receipt_url = payment_data.get('receiptUrl')

        # 1. Create Transaction
        tx_type = 'expense' if debt_type == 'to_pay' else 'income'
        impact = -amount if tx_type == 'expense' else amount

        tx_data = {
            "family_id": family_id,
            "user_id": str(user_id),
            "account_id": str(account_id),
            "category_id": str(category_id) if category_id else None,
            "description": f"[{'PAGO DEUDA' if debt_type == 'to_pay' else 'COBRO DEUDA'}] {description or 'Pago de deuda'}",
            "amount": amount,
            "type": tx_type,
            "date": datetime.utcnow().isoformat(),
            "receipt_url": receipt_url
        }
        
        # Auto-assign category if missing
        if not tx_data["category_id"]:
            default_name = 'Préstamos Otorgados' if debt_type == 'to_pay' else 'Préstamos Recibidos'
            cat_res = self.repository.get_default_category(default_name)
            if cat_res.data:
                tx_data["category_id"] = cat_res.data[0]['id']

        self.repository.insert_transaction(tx_data)

        # 2. Update Account Balance
        acc_res = self.repository.get_account_balance(str(account_id))
        if acc_res.data:
            new_balance = float(acc_res.data[0]['balance']) + impact
            self.repository.update_account_balance(str(account_id), new_balance)

        # 3. Update Debt
        debt_res = self.repository.get_debt_by_id(debt_id, family_id)
        if not debt_res.data:
            raise Exception("Debt not found")
        
        debt = debt_res.data[0]
        new_remaining = max(0, float(debt['remaining_amount']) - amount)
        new_status = 'paid' if new_remaining <= 0 else 'active'

        self.repository.update_debt(debt_id, family_id, {
            "remaining_amount": new_remaining,
            "status": new_status
        })

        return {"status": "success", "new_remaining": new_remaining}
