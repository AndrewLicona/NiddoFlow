"""Pruebas del servicio de presupuestos.

Demuestran dos correcciones:

1. **Bug D4**: lo gastado se calcula acotado al período del presupuesto. Antes
   el dashboard sumaba gastos de todos los meses.
2. **Scope**: `scope='all'` devuelve tanto los presupuestos familiares como los
   personales. Antes el servidor filtraba por `user_id IS NULL` y los
   presupuestos personales nunca llegaban al navegador.
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.budgets_service import BudgetsService  # noqa: E402


class FakeProfileResult:
    def __init__(self, data):
        self.data = data


class FakeBudgetsRepository:
    def __init__(self, budgets, expenses):
        self.budgets = budgets
        self.expenses = expenses
        self.query_filters = None

    def get_user_profile(self, user_id):
        return FakeProfileResult([{"family_id": "fam-1"}])

    def query_budgets(self, filters):
        self.query_filters = filters
        rows = self.budgets
        if "user_id" in filters:
            value = filters["user_id"]
            if value is None:
                rows = [b for b in rows if b.get("user_id") is None]
            else:
                rows = [b for b in rows if b.get("user_id") == value]
        return FakeProfileResult(rows)

    def get_expenses_by_family(self, family_id, start_date=None, end_date=None):
        rows = self.expenses
        if start_date:
            rows = [r for r in rows if str(r["date"])[:10] >= start_date]
        if end_date:
            rows = [r for r in rows if str(r["date"])[:10] <= end_date]
        return FakeProfileResult(rows)

    def upsert_budget(self, budget_id, data):
        return FakeProfileResult([data])

    def delete_budget(self, budget_id, family_id):
        return FakeProfileResult([])


def expense(amount, date_iso, category_id="cat-1", user_id="user-A"):
    return {
        "id": f"tx-{date_iso}-{amount}",
        "amount": amount,
        "type": "expense",
        "date": date_iso,
        "category_id": category_id,
        "user_id": user_id,
    }


@pytest.fixture
def service():
    repo = FakeBudgetsRepository([], [])
    return BudgetsService(repo), repo


class TestBudgetScope:
    @pytest.mark.asyncio
    async def test_scope_all_devuelve_familiares_y_personales(self, service):
        svc, repo = service
        repo.budgets = [
            {"id": "b1", "family_id": "fam-1", "user_id": None, "category_id": "cat-1",
             "amount": 100.0, "period": "monthly", "month": 10, "year": 2026},
            {"id": "b2", "family_id": "fam-1", "user_id": "user-A", "category_id": "cat-1",
             "amount": 100.0, "period": "monthly", "month": 10, "year": 2026},
        ]
        result = await svc.get_budgets("user-A", "all")
        assert len(result) == 2
        assert "user_id" not in repo.query_filters

    @pytest.mark.asyncio
    async def test_scope_family_solo_familiares(self, service):
        svc, repo = service
        repo.budgets = [
            {"id": "b1", "family_id": "fam-1", "user_id": None, "category_id": "cat-1",
             "amount": 100.0, "period": "monthly", "month": 10, "year": 2026},
            {"id": "b2", "family_id": "fam-1", "user_id": "user-A", "category_id": "cat-1",
             "amount": 100.0, "period": "monthly", "month": 10, "year": 2026},
        ]
        result = await svc.get_budgets("user-A", "family")
        assert len(result) == 1
        assert repo.query_filters["user_id"] is None

    @pytest.mark.asyncio
    async def test_scope_personal_solo_los_del_usuario(self, service):
        svc, repo = service
        repo.budgets = [
            {"id": "b1", "family_id": "fam-1", "user_id": None, "category_id": "cat-1",
             "amount": 100.0, "period": "monthly", "month": 10, "year": 2026},
            {"id": "b2", "family_id": "fam-1", "user_id": "user-A", "category_id": "cat-1",
             "amount": 100.0, "period": "monthly", "month": 10, "year": 2026},
        ]
        result = await svc.get_budgets("user-A", "personal")
        assert len(result) == 1
        assert repo.query_filters["user_id"] == "user-A"


class TestBudgetSpent:
    @pytest.mark.asyncio
    async def test_gastado_ignora_meses_anteriores(self, service):
        """Este es el bug D4: el dashboard acumulaba desde el origen."""
        svc, repo = service
        repo.budgets = [
            {"id": "b1", "family_id": "fam-1", "user_id": None, "category_id": "cat-1",
             "amount": 1000.0, "period": "monthly", "month": 10, "year": 2026},
        ]
        repo.expenses = [
            expense(100.0, "2026-10-05"),
            expense(200.0, "2026-10-20"),
            expense(500.0, "2026-09-10"),   # mes anterior: no cuenta
            expense(700.0, "2026-11-02"),   # mes siguiente: no cuenta
        ]
        result = await svc.get_budgets("user-A", "all")
        budget = result[0]
        assert budget["spent"] == 300.0
        assert budget["percent"] == 30.0
        assert budget["remaining"] == 700.0

    @pytest.mark.asyncio
    async def test_presupuesto_personal_solo_cuenta_lo_suyo(self, service):
        svc, repo = service
        repo.budgets = [
            {"id": "b2", "family_id": "fam-1", "user_id": "user-A", "category_id": "cat-1",
             "amount": 1000.0, "period": "monthly", "month": 10, "year": 2026},
        ]
        repo.expenses = [
            expense(100.0, "2026-10-05", user_id="user-A"),
            expense(400.0, "2026-10-06", user_id="user-B"),
        ]
        result = await svc.get_budgets("user-A", "personal")
        assert result[0]["spent"] == 100.0

    @pytest.mark.asyncio
    async def test_estado_segun_el_porcentaje(self, service):
        svc, repo = service
        repo.budgets = [
            {"id": "ok", "family_id": "fam-1", "user_id": None, "category_id": "cat-1",
             "amount": 1000.0, "period": "monthly", "month": 10, "year": 2026},
            {"id": "warn", "family_id": "fam-1", "user_id": None, "category_id": "cat-2",
             "amount": 1000.0, "period": "monthly", "month": 10, "year": 2026},
            {"id": "crit", "family_id": "fam-1", "user_id": None, "category_id": "cat-3",
             "amount": 1000.0, "period": "monthly", "month": 10, "year": 2026},
        ]
        repo.expenses = [
            expense(100.0, "2026-10-05", category_id="cat-1"),
            expense(850.0, "2026-10-05", category_id="cat-2"),
            expense(1200.0, "2026-10-05", category_id="cat-3"),
        ]
        result = await svc.get_budgets("user-A", "all")
        estados = {b["id"]: b["status"] for b in result}
        assert estados["ok"] == "ok"
        assert estados["warn"] == "warning"
        assert estados["crit"] == "critical"
