import logging
from datetime import datetime
from typing import List, Optional

from app.repositories.goals_repository import GoalsRepository
from app.services.base import BaseService

logger = logging.getLogger(__name__)


class GoalsService(BaseService):
    def __init__(self, repository: GoalsRepository):
        super().__init__(repository)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    async def _get_family_id(self, user_id: str) -> Optional[str]:
        profile_res = self.repository.get_user_profile(user_id)
        if not profile_res.data or not profile_res.data[0].get('family_id'):
            return None
        return profile_res.data[0]['family_id']

    def _enrich(self, goal: dict, category_names: dict) -> dict:
        enriched = dict(goal)
        category_id = enriched.get('category_id')
        enriched['category_name'] = category_names.get(category_id) if category_id else None

        target = float(enriched.get('target_amount') or 0)
        saved = float(enriched.get('saved_amount') or 0)
        if target > 0:
            enriched['progress_pct'] = round(min(saved / target, 1.0) * 100, 2)
        else:
            enriched['progress_pct'] = 0.0
        return enriched

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    async def get_goals(self, user_id: str, scope: str = "family") -> List[dict]:
        family_id = await self._get_family_id(user_id)
        if not family_id:
            return []

        created_by = str(user_id) if scope == "personal" else None
        res = self.repository.get_goals(family_id, created_by)
        goals = res.data or []

        category_names = self.repository.get_category_names(family_id)
        return [self._enrich(goal, category_names) for goal in goals]

    async def create_goal(self, user_id: str, goal_data: dict) -> dict:
        family_id = await self._get_family_id(user_id)
        if not family_id:
            raise Exception("El usuario no pertenece a una familia")

        name = (goal_data.get('name') or '').strip()
        if not name:
            raise Exception("El nombre de la meta es obligatorio")

        target_amount = goal_data.get('target_amount')
        if target_amount is None or float(target_amount) <= 0:
            raise Exception("El monto objetivo debe ser mayor que cero")

        payload = {
            "family_id": family_id,
            "name": name,
            "target_amount": float(target_amount),
            "saved_amount": 0,
            "target_date": self._format_date(goal_data.get('target_date')),
            "category_id": str(goal_data['category_id']) if goal_data.get('category_id') else None,
            "created_by": str(user_id),
        }

        res = self.repository.insert_goal(payload)
        if not res.data:
            raise Exception("No se pudo crear la meta")

        category_names = self.repository.get_category_names(family_id)
        return self._enrich(res.data[0], category_names)

    async def update_goal(self, user_id: str, goal_id: str, updates: dict) -> dict:
        family_id = await self._get_family_id(user_id)
        if not family_id:
            raise Exception("El usuario no pertenece a una familia")

        goal = await self._get_goal_or_404(goal_id, family_id)

        payload = {}
        if updates.get('name') is not None:
            name = (updates.get('name') or '').strip()
            if not name:
                raise Exception("El nombre de la meta es obligatorio")
            payload["name"] = name
        if updates.get('target_amount') is not None:
            target = float(updates['target_amount'])
            if target <= 0:
                raise Exception("El monto objetivo debe ser mayor que cero")
            payload["target_amount"] = target
        if updates.get('saved_amount') is not None:
            saved = float(updates['saved_amount'])
            if saved < 0:
                raise Exception("El monto ahorrado no puede ser negativo")
            payload["saved_amount"] = saved
        if 'target_date' in updates:
            payload["target_date"] = self._format_date(updates.get('target_date'))
        if 'category_id' in updates:
            payload["category_id"] = str(updates['category_id']) if updates.get('category_id') else None

        if not payload:
            category_names = self.repository.get_category_names(family_id)
            return self._enrich(goal, category_names)

        res = self.repository.update_goal(goal_id, family_id, payload)
        if not res.data:
            raise Exception("Meta no encontrada")

        category_names = self.repository.get_category_names(family_id)
        return self._enrich(res.data[0], category_names)

    async def delete_goal(self, user_id: str, goal_id: str) -> dict:
        family_id = await self._get_family_id(user_id)
        if not family_id:
            raise Exception("El usuario no pertenece a una familia")

        await self._get_goal_or_404(goal_id, family_id)
        self.repository.delete_goal(goal_id, family_id)
        return {"deleted": True}

    # ------------------------------------------------------------------
    # Aporte a la meta
    # ------------------------------------------------------------------

    async def contribute_to_goal(self, user_id: str, goal_id: str, contribution: dict) -> dict:
        """Suma el aporte a ``saved_amount`` de la meta.

        El aporte se registra como un movimiento de gasto en la cuenta
        indicada, para que el balance quede cuadrado. La meta se actualiza
        con el nuevo ``saved_amount``.
        """
        family_id = await self._get_family_id(user_id)
        if not family_id:
            raise Exception("El usuario no pertenece a una familia")

        goal = await self._get_goal_or_404(goal_id, family_id)

        amount = contribution.get('amount')
        if amount is None or float(amount) <= 0:
            raise Exception("El monto del aporte debe ser mayor que cero")
        amount = float(amount)

        account_id = contribution.get('account_id')
        if not account_id:
            raise Exception("La cuenta es obligatoria")

        account_res = self.repository.get_account_by_id(str(account_id), family_id)
        if not account_res.data:
            raise Exception("La cuenta no pertenece a la familia")

        tx_data = {
            "family_id": family_id,
            "user_id": str(user_id),
            "account_id": str(account_id),
            "category_id": str(goal['category_id']) if goal.get('category_id') else None,
            "description": f"Aporte a meta: {goal.get('name')}",
            "amount": amount,
            "type": "expense",
            "date": datetime.utcnow().isoformat(),
        }

        tx_res = self.repository.insert_transaction(tx_data)
        if not tx_res.data:
            raise Exception("No se pudo registrar el aporte")
        transaction = tx_res.data[0]

        new_saved = float(goal.get('saved_amount') or 0) + amount
        res = self.repository.update_goal(goal_id, family_id, {"saved_amount": new_saved})
        if not res.data:
            raise Exception("No se pudo actualizar la meta")

        category_names = self.repository.get_category_names(family_id)
        result = self._enrich(res.data[0], category_names)
        result['transaction'] = transaction
        return result

    # ------------------------------------------------------------------

    async def _get_goal_or_404(self, goal_id: str, family_id: str) -> dict:
        res = self.repository.get_goal_by_id(goal_id, family_id)
        if not res.data:
            raise Exception("Meta no encontrada")
        return res.data[0]

    def _format_date(self, value) -> Optional[str]:
        if value is None:
            return None
        if hasattr(value, 'isoformat'):
            return value.isoformat()
        return str(value)
