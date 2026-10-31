import logging
from datetime import datetime
from typing import List, Optional

from app.repositories.shopping_repository import ShoppingRepository
from app.services.base import BaseService

logger = logging.getLogger(__name__)

PRIORITIES = ("low", "normal", "high")
STATUSES = ("pending", "purchased", "skipped")


class ShoppingService(BaseService):
    def __init__(self, repository: ShoppingRepository):
        super().__init__(repository)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    async def _get_family_id(self, user_id: str) -> Optional[str]:
        profile_res = self.repository.get_user_profile(user_id)
        if not profile_res.data or not profile_res.data[0].get('family_id'):
            return None
        return profile_res.data[0]['family_id']

    def _enrich(self, item: dict, category_names: dict) -> dict:
        enriched = dict(item)
        category_id = enriched.get('category_id')
        enriched['category_name'] = category_names.get(category_id) if category_id else None
        return enriched

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    async def get_shopping_items(
        self, user_id: str, scope: str = "family", status: Optional[str] = None
    ) -> List[dict]:
        """Lista las necesidades de la familia (o las del usuario si scope=personal)."""
        family_id = await self._get_family_id(user_id)
        if not family_id:
            return []

        created_by = str(user_id) if scope == "personal" else None
        res = self.repository.get_shopping_items(family_id, status, created_by)
        items = res.data or []

        category_names = self.repository.get_category_names(family_id)
        return [self._enrich(item, category_names) for item in items]

    async def create_shopping_item(self, user_id: str, item_data: dict) -> dict:
        family_id = await self._get_family_id(user_id)
        if not family_id:
            raise Exception("El usuario no pertenece a una familia")

        name = (item_data.get('name') or '').strip()
        if not name:
            raise Exception("El nombre de la necesidad es obligatorio")

        priority = (item_data.get('priority') or 'normal').strip().lower()
        if priority not in PRIORITIES:
            priority = 'normal'

        payload = {
            "family_id": family_id,
            "name": name,
            "category_id": str(item_data['category_id']) if item_data.get('category_id') else None,
            "quantity": item_data.get('quantity') if item_data.get('quantity') is not None else 1,
            "estimated_price": item_data.get('estimated_price'),
            "priority": priority,
            "status": "pending",
            "notes": item_data.get('notes'),
            "created_by": str(user_id),
        }

        res = self.repository.insert_shopping_item(payload)
        if not res.data:
            raise Exception("No se pudo crear la necesidad")

        created = res.data[0]
        category_names = self.repository.get_category_names(family_id)
        return self._enrich(created, category_names)

    async def update_shopping_item(self, user_id: str, item_id: str, updates: dict) -> dict:
        family_id = await self._get_family_id(user_id)
        if not family_id:
            raise Exception("El usuario no pertenece a una familia")

        item = await self._get_item_or_404(item_id, family_id)

        payload = {}
        if updates.get('name') is not None:
            name = (updates.get('name') or '').strip()
            if not name:
                raise Exception("El nombre de la necesidad es obligatorio")
            payload["name"] = name
        if 'category_id' in updates:
            payload["category_id"] = str(updates['category_id']) if updates.get('category_id') else None
        if updates.get('quantity') is not None:
            payload["quantity"] = updates['quantity']
        if 'estimated_price' in updates:
            payload["estimated_price"] = updates.get('estimated_price')
        if updates.get('priority') is not None:
            priority = updates['priority'].strip().lower()
            if priority not in PRIORITIES:
                raise Exception("La prioridad debe ser low, normal o high")
            payload["priority"] = priority
        if updates.get('status') is not None:
            status = updates['status'].strip().lower()
            if status not in STATUSES:
                raise Exception("El estado debe ser pending, purchased o skipped")
            payload["status"] = status
        if 'notes' in updates:
            payload["notes"] = updates.get('notes')

        if not payload:
            category_names = self.repository.get_category_names(family_id)
            return self._enrich(item, category_names)

        res = self.repository.update_shopping_item(item_id, family_id, payload)
        if not res.data:
            raise Exception("Necesidad no encontrada")

        category_names = self.repository.get_category_names(family_id)
        return self._enrich(res.data[0], category_names)

    async def delete_shopping_item(self, user_id: str, item_id: str) -> dict:
        family_id = await self._get_family_id(user_id)
        if not family_id:
            raise Exception("El usuario no pertenece a una familia")

        item = await self._get_item_or_404(item_id, family_id)

        warnings = {}
        if item.get('purchase_transaction_id'):
            warnings["transaction_kept"] = True
            warnings["message"] = (
                "La necesidad se elimino, pero el movimiento de compra se conserva."
            )

        self.repository.delete_shopping_item(item_id, family_id)
        return {"deleted": True, "warnings": warnings}

    # ------------------------------------------------------------------
    # Compra
    # ------------------------------------------------------------------

    async def purchase_shopping_item(self, user_id: str, item_id: str, purchase_data: dict) -> dict:
        """Marca la necesidad como comprada y crea el movimiento de gasto.

        El movimiento usa la categoria de la necesidad y el balance de la cuenta
        lo actualiza el trigger de la base de datos
        (``sync_account_balances_from_transactions``), igual que en
        ``debts_service``.
        """
        family_id = await self._get_family_id(user_id)
        if not family_id:
            raise Exception("El usuario no pertenece a una familia")

        item = await self._get_item_or_404(item_id, family_id)

        if item.get('status') == 'purchased' and item.get('purchase_transaction_id'):
            raise Exception("Esta necesidad ya fue comprada")

        account_id = purchase_data.get('account_id')
        if not account_id:
            raise Exception("La cuenta es obligatoria")

        account_res = self.repository.get_account_by_id(str(account_id), family_id)
        if not account_res.data:
            raise Exception("La cuenta no pertenece a la familia")

        amount = purchase_data.get('amount')
        if amount is None:
            amount = item.get('estimated_price')
        if amount is None:
            raise Exception("El monto es obligatorio")
        amount = float(amount)
        if amount <= 0:
            raise Exception("El monto debe ser mayor que cero")

        date = purchase_data.get('date') or datetime.utcnow()
        if isinstance(date, datetime):
            date_iso = date.isoformat()
        else:
            date_iso = str(date)

        description = purchase_data.get('description') or f"Compra: {item.get('name')}"

        tx_data = {
            "family_id": family_id,
            "user_id": str(user_id),
            "account_id": str(account_id),
            "category_id": str(item['category_id']) if item.get('category_id') else None,
            "description": description,
            "amount": amount,
            "type": "expense",
            "date": date_iso,
        }

        tx_res = self.repository.insert_transaction(tx_data)
        if not tx_res.data:
            raise Exception("No se pudo crear el movimiento de compra")
        transaction = tx_res.data[0]

        payload = {
            "status": "purchased",
            "purchase_transaction_id": transaction.get('id'),
            "purchased_at": datetime.utcnow().isoformat(),
        }
        res = self.repository.update_shopping_item(item_id, family_id, payload)
        if not res.data:
            raise Exception("No se pudo marcar la necesidad como comprada")

        category_names = self.repository.get_category_names(family_id)
        result = self._enrich(res.data[0], category_names)
        result['transaction'] = transaction
        return result

    # ------------------------------------------------------------------

    async def _get_item_or_404(self, item_id: str, family_id: str) -> dict:
        res = self.repository.get_shopping_item_by_id(item_id, family_id)
        if not res.data:
            raise Exception("Necesidad no encontrada")
        return res.data[0]
