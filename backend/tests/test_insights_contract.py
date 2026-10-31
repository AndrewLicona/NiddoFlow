"""Test de contrato de `/insights` (CONTRATOS_IMPLEMENTACION.md §2).

No necesita base de datos: el repositorio se sustituye por un doble en
memoria. Se valida:

  1. La FORMA exacta de la respuesta (mismas keys y tipos del contrato).
  2. El acotado por mes (el bug D4): los gastos de otros meses NO cuentan.
  3. `budgets[].spent` con el gasto EXCLUSIVO del mes/semana del presupuesto.
  4. La replica de la semana ISO (`getWeekNumber` / `getStartOfWeek`).

Ejecución sin pytest:
    cd backend && .\\venv\\Scripts\\python.exe tests\\test_insights_contract.py
"""

import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# --- El test debe poder ejecutarse desde cualquier directorio ---------------
BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

_ENV_FILE = BACKEND_ROOT / ".env"
if _ENV_FILE.exists():
    for _line in _ENV_FILE.read_text(encoding="utf-8").splitlines():
        _line = _line.strip()
        if not _line or _line.startswith("#") or "=" not in _line:
            continue
        _key, _value = _line.split("=", 1)
        os.environ.setdefault(
            _key.strip(), _value.strip().strip('"').strip("'").strip("'")
        )
# Si no hay .env (CI), el import de app.db.supabase igual debe funcionar.
os.environ.setdefault("SUPABASE_URL", "https://placeholder.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "placeholder-key")

from app.models.insights import InsightsResponse  # noqa: E402
from app.repositories.insights_repository import InsightsRepository  # noqa: E402
from app.services.insights_service import (  # noqa: E402
    InsightsService,
    get_start_of_week,
    get_week_number,
    month_bounds,
    prev_month_bounds,
)

# ---------------------------------------------------------------------------
# Datos de prueba
# ---------------------------------------------------------------------------
FAMILY_ID = "fam-1"
USER_ID = "user-1"

CATEGORIES = {
    "cat-food": {"id": "cat-food", "name": "Alimentación", "type": "expense"},
    "cat-trans": {"id": "cat-trans", "name": "Transporte", "type": "expense"},
    "cat-sal": {"id": "cat-sal", "name": "Salud", "type": "expense"},
    "cat-ent": {"id": "cat-ent", "name": "Entretenimiento", "type": "expense"},
    "cat-home": {"id": "cat-home", "name": "Hogar", "type": "expense"},
}

ACCOUNTS = [
    {
        "id": "acc-1",
        "name": "Principal",
        "type": "personal",
        "user_id": USER_ID,
        "balance": 2000000.0,
        "family_id": FAMILY_ID,
    },
    {
        "id": "acc-2",
        "name": "Familiar",
        "type": "joint",
        "user_id": None,
        "balance": 1000000.0,
        "family_id": FAMILY_ID,
    },
]

PROFILES = [
    {"id": USER_ID, "full_name": "Andrew Licona", "family_id": FAMILY_ID},
    {"id": "user-2", "full_name": "Jhosep Licona", "family_id": FAMILY_ID},
]


def _tx(tx_id, date, tx_type, amount, category_id, account_id, user_id, description):
    return {
        "id": tx_id,
        "description": description,
        "amount": amount,
        "type": tx_type,
        "date": datetime(*date, tzinfo=timezone.utc),
        "category_id": category_id,
        "category": CATEGORIES.get(category_id),
        "account_id": account_id,
        "account": {
            "id": account_id,
            "name": next(a["name"] for a in ACCOUNTS if a["id"] == account_id),
            "type": next(a["type"] for a in ACCOUNTS if a["id"] == account_id),
        },
        "user_id": user_id,
        "family_id": FAMILY_ID,
    }


TRANSACTIONS = [
    # --- Octubre 2026 (el mes analizado) ---
    _tx("t1", (2026, 10, 2, 12), "expense", 300000, "cat-food", "acc-2", USER_ID, "Olimpica"),
    _tx("t2", (2026, 10, 5, 12), "expense", 150000, "cat-food", "acc-1", "user-2", "Homecenter"),
    _tx("t3", (2026, 10, 10, 12), "income", 1000000, None, "acc-1", USER_ID, "Salario"),
    _tx("t4", (2026, 10, 12, 12), "expense", 90000, "cat-trans", "acc-2", "user-2", "Uber"),
    _tx("t5", (2026, 10, 3, 12), "expense", 55000, "cat-ent", "acc-1", USER_ID, "Netflix"),
    _tx("t6", (2026, 10, 10, 12), "expense", 55000, "cat-ent", "acc-1", USER_ID, "NETFLIX"),
    _tx("t7", (2026, 10, 17, 12), "expense", 55000, "cat-ent", "acc-1", USER_ID, "Netflix"),
    _tx("t8", (2026, 10, 24, 12), "expense", 55000, "cat-ent", "acc-1", USER_ID, "Netflix"),
    _tx("t9", (2026, 10, 4, 12), "expense", 100000, "cat-home", "acc-2", USER_ID, "Hogar BA"),
    _tx("t10", (2026, 10, 6, 12), "expense", 110000, "cat-home", "acc-2", USER_ID, "Hogar BB"),
    _tx("t11", (2026, 10, 8, 12), "expense", 120000, "cat-home", "acc-2", USER_ID, "Hogar BC"),
    _tx("t12", (2026, 10, 9, 12), "expense", 1500000, "cat-home", "acc-2", USER_ID, "Electrodomestico XYZ"),
    _tx("t13", (2026, 10, 8, 12), "expense", 50000, "cat-sal", "acc-1", USER_ID, "Farmatodo"),
    _tx("t14", (2026, 10, 9, 12), "expense", 70000, "cat-sal", "acc-2", "user-2", "Farmatodo"),
    # Semana 43: NO pertenece al presupuesto semanal de la semana 42.
    _tx("t15", (2026, 10, 20, 12), "expense", 50000, "cat-trans", "acc-1", "user-2", "Taxi"),
    # --- Septiembre 2026 (mes anterior) ---
    _tx("t16", (2026, 9, 15, 12), "expense", 500000, "cat-food", "acc-2", USER_ID, "Olimpica"),
    _tx("t17", (2026, 9, 20, 12), "expense", 400000, "cat-trans", "acc-2", USER_ID, "Gasolina"),
    # --- Agosto 2026 (fuera de los dos meses) ---
    _tx("t18", (2026, 8, 20, 12), "expense", 999999, "cat-food", "acc-2", USER_ID, "Olimpica Antigua"),
]

BUDGETS = [
    {
        "id": "b-monthly",
        "category_id": "cat-food",
        "category": CATEGORIES["cat-food"],
        "family_id": FAMILY_ID,
        "amount": 1000000.0,
        "period": "monthly",
        "month": 10,
        "week_number": None,
        "year": 2026,
        "start_date": None,
        "end_date": None,
        "user_id": None,
    },
    {
        "id": "b-weekly",
        "category_id": "cat-trans",
        "category": CATEGORIES["cat-trans"],
        "family_id": FAMILY_ID,
        "amount": 200000.0,
        "period": "weekly",
        "month": None,
        "week_number": 42,
        "year": 2026,
        "start_date": None,
        "end_date": None,
        "user_id": None,
    },
    {
        "id": "b-personal",
        "category_id": "cat-sal",
        "category": CATEGORIES["cat-sal"],
        "family_id": FAMILY_ID,
        "amount": 300000.0,
        "period": "monthly",
        "month": 10,
        "week_number": None,
        "year": 2026,
        "start_date": None,
        "end_date": None,
        "user_id": USER_ID,
    },
]


# ---------------------------------------------------------------------------
# Doble del repositorio (sin base de datos)
# ---------------------------------------------------------------------------
class FakeInsightsRepository(InsightsRepository):
    def __init__(self):
        # No se llama a BaseRepository.__init__ a proposito: asi el test no
        # toca la base de datos real.
        self.db = None
        self.prisma = None

    async def get_user_profile(self, user_id: str):
        return {"id": user_id, "family_id": FAMILY_ID, "full_name": "Andrew Licona"}

    async def get_accounts(self, family_id: str, user_id: str, scope: str = "family"):
        if scope == "personal":
            return [a for a in ACCOUNTS if a.get("user_id") == user_id]
        return [
            a
            for a in ACCOUNTS
            if not a.get("user_id") or str(a.get("user_id")) == str(user_id)
        ]

    async def get_transactions(self, family_id, account_ids, start_date=None, end_date=None):
        allowed = {str(a) for a in account_ids}
        rows = []
        for tx in TRANSACTIONS:
            if str(tx["account_id"]) not in allowed:
                continue
            if start_date and tx["date"] < datetime.fromisoformat(start_date):
                continue
            if end_date and tx["date"] > datetime.fromisoformat(end_date):
                continue
            rows.append(tx)
        return rows

    async def get_budgets(self, family_id: str):
        return list(BUDGETS)

    async def get_profiles(self, user_ids):
        wanted = {str(u) for u in user_ids}
        return [p for p in PROFILES if str(p["id"]) in wanted]


# ---------------------------------------------------------------------------
# Contrato esperado (CONTRATOS_IMPLEMENTACION.md §2)
# ---------------------------------------------------------------------------
CONTRACT_KEYS = {
    "": {
        "month",
        "scope",
        "totals",
        "by_category",
        "by_member",
        "by_account",
        "budgets",
        "top_merchants",
        "recurring",
        "anomalies",
        "cashflow",
        "price_history",
    },
    "totals": {
        "income",
        "expense",
        "balance",
        "savings_rate",
        "transaction_count",
        "prev_month_expense",
        "expense_trend_pct",
    },
    "by_category": {"category_id", "category", "amount", "pct_of_total", "trend_vs_last_month"},
    "by_member": {"user_id", "member", "amount", "transaction_count"},
    "by_account": {"account_id", "account", "type", "amount"},
    "budgets": {
        "budget_id",
        "category_id",
        "category",
        "amount",
        "spent",
        "percent",
        "status",
        "period",
    },
    "top_merchants": {"merchant", "amount", "visits"},
    "recurring": {"merchant", "amount", "cadence", "last_seen", "confidence"},
    "anomalies": {"kind", "category", "message", "severity"},
    "cashflow": {
        "projected_end_of_month",
        "daily_avg_spend",
        "days_of_expense_remaining",
    },
}


def _keys(payload: dict) -> set:
    return set(payload.keys())


def _service():
    return InsightsService(FakeInsightsRepository())


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
def test_response_shape_matches_contract():
    """La respuesta tiene EXACTAMENTE las keys y los tipos del contrato."""
    import asyncio

    result = asyncio.run(_service().get_insights(USER_ID, "family", "2026-10"))
    assert isinstance(result, InsightsResponse)

    payload = result.model_dump()
    assert _keys(payload) == CONTRACT_KEYS[""]
    assert _keys(payload["totals"]) == CONTRACT_KEYS["totals"]

    for block in ("by_category", "by_member", "by_account", "budgets",
                  "top_merchants", "recurring", "anomalies"):
        assert _keys(payload[block][0]) == CONTRACT_KEYS[block], block

    assert _keys(payload["cashflow"]) == CONTRACT_KEYS["cashflow"]

    # Tipos
    assert isinstance(payload["month"], str)
    assert isinstance(payload["scope"], str)
    assert isinstance(payload["totals"]["income"], float)
    assert isinstance(payload["totals"]["transaction_count"], int)
    assert isinstance(payload["price_history"], list)
    assert payload["price_history"] == []


def test_totals_are_scoped_to_the_requested_month():
    """D4: los totales solo cuentan los movimientos del mes pedido."""
    import asyncio

    result = asyncio.run(_service().get_insights(USER_ID, "family", "2026-10"))
    totals = result.totals

    # Gastos de octubre: 300000 + 150000 + 90000 + 4x55000 + 1830000 + 50000 + 70000 + 50000
    assert totals.expense == 2760000.0
    assert totals.income == 1000000.0
    assert totals.balance == -1760000.0
    assert totals.savings_rate == -176.0
    assert totals.transaction_count == 15

    # Septiembre (mes anterior) y agosto NO entran en los totales de octubre.
    assert totals.prev_month_expense == 900000.0
    assert totals.expense_trend_pct == 206.67

    # Un mes sin datos devuelve ceros, no arrastra el total.
    empty = asyncio.run(_service().get_insights(USER_ID, "family", "2026-07"))
    assert empty.totals.expense == 0.0
    assert empty.totals.income == 0.0


def test_budget_spent_uses_only_the_budget_period():
    """`spent` = gastos EXCLUSIVAMENTE del mes/semana del presupuesto."""
    import asyncio

    result = asyncio.run(_service().get_insights(USER_ID, "family", "2026-10"))
    budgets = {b.budget_id: b for b in result.budgets}

    # Mensual de octubre: solo los gastos de octubre de esa categoría
    # (300000 + 150000). NO cuenta agosto (999999) ni septiembre (500000).
    monthly = budgets["b-monthly"]
    assert monthly.spent == 450000.0
    assert monthly.percent == 45.0
    assert monthly.status == "ok"
    assert monthly.category == "Alimentación"

    # Semanal: solo la semana ISO 42 (lunes 12 -> domingo 18 de octubre).
    # El gasto del 20 de octubre (semana 43) queda fuera.
    weekly = budgets["b-weekly"]
    assert weekly.spent == 90000.0
    assert weekly.percent == 45.0
    assert weekly.period == "weekly"

    # Personal: solo los movimientos del dueño del presupuesto.
    personal = budgets["b-personal"]
    assert personal.spent == 50000.0
    assert personal.category == "Salud"


def test_by_category_and_by_member():
    import asyncio

    result = asyncio.run(_service().get_insights(USER_ID, "family", "2026-10"))

    categories = {c.category: c for c in result.by_category}
    assert categories["Hogar"].amount == 1830000.0
    assert categories["Hogar"].pct_of_total == 66.3
    assert categories["Alimentación"].amount == 450000.0
    assert categories["Alimentación"].trend_vs_last_month == -10.0
    assert categories["Transporte"].trend_vs_last_month == -65.0

    members = {m.member: m for m in result.by_member}
    assert members["Andrew Licona"].amount == 2400000.0
    assert members["Andrew Licona"].transaction_count == 10
    assert members["Jhosep Licona"].amount == 360000.0
    assert members["Jhosep Licona"].transaction_count == 4


def test_top_merchants_recurring_and_anomalies():
    import asyncio

    result = asyncio.run(_service().get_insights(USER_ID, "family", "2026-10"))

    merchants = {m.merchant.lower(): m for m in result.top_merchants}
    assert "netflix" in merchants
    assert merchants["netflix"].amount == 220000.0
    assert merchants["netflix"].visits == 4

    # Netflix aparece 4 veces con 7 días de diferencia -> semanal.
    recurring = {r.merchant.lower(): r for r in result.recurring}
    assert "netflix" in recurring
    assert recurring["netflix"].cadence == "weekly"
    assert recurring["netflix"].amount == 55000.0
    assert recurring["netflix"].last_seen == "2026-10-24"
    assert 0.0 <= recurring["netflix"].confidence <= 1.0

    kinds = {a.kind for a in result.anomalies}
    assert "category_drop" in kinds  # Transporte -65%
    assert "unusual_amount" in kinds  # Electrodomestico XYZ
    for anomaly in result.anomalies:
        assert anomaly.severity in ("info", "warning", "critical")


def test_cashflow_shape():
    import asyncio

    result = asyncio.run(_service().get_insights(USER_ID, "family", "2026-10"))
    cashflow = result.cashflow
    assert isinstance(cashflow.projected_end_of_month, float)
    assert isinstance(cashflow.daily_avg_spend, float)
    assert isinstance(cashflow.days_of_expense_remaining, float)
    assert cashflow.daily_avg_spend >= 0
    assert cashflow.days_of_expense_remaining >= 0


def test_iso_week_helpers_match_python_isocalendar():
    """La semana ISO replicada debe coincidir con `date.isocalendar()`."""
    from datetime import date, timedelta

    day = date(2025, 12, 1)
    while day < date(2027, 3, 1):
        expected_year, expected_week, _ = day.isocalendar()
        dt = datetime(day.year, day.month, day.day, tzinfo=timezone.utc)
        assert get_week_number(dt) == expected_week, day

        # El lunes de esa semana ISO debe caer en la semana ISO correcta.
        monday = get_start_of_week(expected_week, expected_year)
        assert monday.isoweekday() == 1, monday
        assert monday.isocalendar()[1] == expected_week, monday
        day += timedelta(days=1)

    # Lunes 12 de octubre de 2026 -> semana ISO 42.
    assert get_week_number(datetime(2026, 10, 12, tzinfo=timezone.utc)) == 42
    assert get_start_of_week(42, 2026) == datetime(2026, 10, 12, tzinfo=timezone.utc)


def test_local_budget_fallback_matches_shared_budget_period():
    """El respaldo local calcula el mismo `spent` que `budget_period`."""
    import asyncio

    import app.services.insights_service as insights_service

    shared = insights_service._shared_compute_budget_spent
    assert shared is not None, "budget_period.compute_budget_spent no está disponible"

    service = _service()
    with_shared = asyncio.run(service.get_insights(USER_ID, "family", "2026-10"))

    try:
        insights_service._shared_compute_budget_spent = None
        without_shared = asyncio.run(service.get_insights(USER_ID, "family", "2026-10"))
    finally:
        insights_service._shared_compute_budget_spent = shared

    assert [b.spent for b in with_shared.budgets] == [b.spent for b in without_shared.budgets]
    assert [b.percent for b in with_shared.budgets] == [
        b.percent for b in without_shared.budgets
    ]


def test_month_helpers():
    assert prev_month_bounds(2026, 1) == (2025, 12)
    assert prev_month_bounds(2026, 10) == (2026, 9)
    start, end = month_bounds(2026, 10)
    assert start == datetime(2026, 10, 1, tzinfo=timezone.utc)
    assert end.year == 2026 and end.month == 10 and end.day == 31


def test_service_survives_a_failing_repository():
    """Si la base de datos falla, el endpoint devuelve la parte vacía."""
    import asyncio

    class BrokenRepository(FakeInsightsRepository):
        async def get_accounts(self, family_id, user_id, scope="family"):
            raise RuntimeError("base de datos caida")

    result = asyncio.run(InsightsService(BrokenRepository()).get_insights(
        USER_ID, "family", "2026-10"
    ))
    assert result.month == "2026-10"
    assert result.totals.expense == 0.0
    assert result.by_category == []


if __name__ == "__main__":
    failures = 0
    for name, func in sorted(globals().items()):
        if name.startswith("test_") and callable(func):
            try:
                func()
                print(f"OK   {name}")
            except AssertionError as exc:
                failures += 1
                print(f"FAIL {name}: {exc}")
            except Exception as exc:  # pragma: no cover
                failures += 1
                print(f"ERROR {name}: {type(exc).__name__}: {exc}")
    print("\n" + ("TODO OK" if failures == 0 else f"{failures} FALLOS"))
    sys.exit(1 if failures else 0)
