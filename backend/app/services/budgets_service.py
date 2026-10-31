from datetime import datetime
from typing import List, Optional
from app.services.base import BaseService
from app.services.budget_period import budget_period_range, compute_budget_spent
from app.repositories.budgets_repository import BudgetsRepository

class BudgetsService(BaseService):
    def __init__(self, repository: BudgetsRepository):
        super().__init__(repository)

    async def get_budgets(self, user_id: str, scope: str = "all"):
        """Devuelve los presupuestos de la familia con lo gastado ya calculado.

        `scope`:
          * "all"     → todos los presupuestos (personales y familiares)
          * "family"  → solo los compartidos (`user_id` nulo)
          * "personal"→ solo los del usuario

        El valor por defecto es "all" porque el filtro por alcance se aplica
        en la interfaz; devolver solo los familiares desde el servidor hacía
        que los presupuestos personales nunca llegaran al navegador.
        """
        profile_res = self.repository.get_user_profile(user_id)
        if not profile_res.data or not profile_res.data[0].get('family_id'):
            return []

        family_id = profile_res.data[0]['family_id']

        filters = {"family_id": family_id}
        if scope == "personal":
            filters["user_id"] = user_id
        elif scope == "family":
            filters["user_id"] = None  # Presupuestos compartidos

        res = self.repository.query_budgets(filters)
        budgets = res.data or []

        # Calcula lo gastado en el servidor para cada presupuesto.
        transactions = self._get_expenses(family_id, budgets)
        for budget in budgets:
            spent, percent, remaining = compute_budget_spent(budget, transactions)
            budget["spent"] = spent
            budget["percent"] = percent
            budget["remaining"] = remaining
            budget["status"] = (
                "critical" if percent >= 100 else "warning" if percent >= 80 else "ok"
            )

        return budgets

    def _get_expenses(self, family_id: str, budgets: list) -> list:
        """Gastos de la familia dentro del rango que cubren los presupuestos."""
        ranges = [budget_period_range(b) for b in budgets]
        ranges = [r for r in ranges if r is not None]
        if not ranges:
            return []

        start = min(r[0] for r in ranges).isoformat()
        end = max(r[1] for r in ranges).isoformat()

        try:
            res = self.repository.get_expenses_by_family(family_id, start, end)
            return res.data or []
        except Exception:
            return []

    async def create_or_update_budget(self, user_id: str, budget_data: dict):
        profile_res = self.repository.get_user_profile(user_id)
        if not profile_res.data or not profile_res.data[0].get('family_id'):
            raise Exception("User not in a family")
        
        family_id = profile_res.data[0]['family_id']
        
        data = {**budget_data}
        data['family_id'] = family_id
        for date_key in ['start_date', 'end_date']:
            if data.get(date_key) and isinstance(data[date_key], datetime):
                data[date_key] = data[date_key].isoformat()
        
        # Check if exists
        check_filters = {
            "family_id": family_id,
            "category_id": data.get('category_id'),
            "period": data.get('period'),
            "year": data.get('year'),
            "month": data.get('month'),
            "week_number": data.get('week_number'),
            "user_id": data.get('user_id')
        }
        
        existing = self.repository.query_budgets(check_filters)
        budget_id = existing.data[0]['id'] if existing.data else None
        
        res = self.repository.upsert_budget(budget_id, data)
        if not res.data:
            raise Exception("Failed to create/update budget")
        
        return res.data[0]

    async def delete_budget(self, user_id: str, budget_id: str):
        profile_res = self.repository.get_user_profile(user_id)
        family_id = profile_res.data[0].get('family_id')
        self.repository.delete_budget(budget_id, family_id)
        return True
