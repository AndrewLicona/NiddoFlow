from typing import List, Literal, Optional

from pydantic import BaseModel

# Contrato /insights (CONTRATOS_IMPLEMENTACION.md §2).
# Las claves y los tipos son EXACTAMENTE los del contrato: el frontend (agente F)
# y el agente de IA (agente D) consumen esta forma.


class InsightsTotals(BaseModel):
    income: float = 0.0
    expense: float = 0.0
    balance: float = 0.0
    savings_rate: float = 0.0
    transaction_count: int = 0
    prev_month_expense: float = 0.0
    expense_trend_pct: float = 0.0


class InsightsByCategory(BaseModel):
    category_id: Optional[str] = None
    category: str = "Sin categoría"
    amount: float = 0.0
    pct_of_total: float = 0.0
    trend_vs_last_month: float = 0.0


class InsightsByMember(BaseModel):
    user_id: Optional[str] = None
    member: str = "Sin asignar"
    amount: float = 0.0
    transaction_count: int = 0


class InsightsByAccount(BaseModel):
    account_id: str
    account: str
    type: str
    amount: float = 0.0


class InsightsBudget(BaseModel):
    budget_id: str
    category_id: str
    category: str = "General"
    amount: float = 0.0
    spent: float = 0.0
    percent: float = 0.0
    status: Literal["ok", "warning", "critical"] = "ok"
    period: str = "monthly"


class InsightsTopMerchant(BaseModel):
    merchant: str
    amount: float = 0.0
    visits: int = 0


class InsightsRecurring(BaseModel):
    merchant: str
    amount: float = 0.0
    cadence: Literal["weekly", "biweekly", "monthly", "quarterly", "yearly"] = "monthly"
    last_seen: str = ""
    confidence: float = 0.0


class InsightsAnomaly(BaseModel):
    kind: Literal[
        "category_spike", "category_drop", "budget_critical", "unusual_amount"
    ]
    category: str = "Sin categoría"
    message: str = ""
    severity: Literal["info", "warning", "critical"] = "info"


class InsightsCashflow(BaseModel):
    projected_end_of_month: float = 0.0
    daily_avg_spend: float = 0.0
    days_of_expense_remaining: float = 0.0


class InsightsResponse(BaseModel):
    month: str
    scope: str = "family"
    totals: InsightsTotals = InsightsTotals()
    by_category: List[InsightsByCategory] = []
    by_member: List[InsightsByMember] = []
    by_account: List[InsightsByAccount] = []
    budgets: List[InsightsBudget] = []
    top_merchants: List[InsightsTopMerchant] = []
    recurring: List[InsightsRecurring] = []
    anomalies: List[InsightsAnomaly] = []
    cashflow: InsightsCashflow = InsightsCashflow()
    # Lo pueblan los agentes B/C; puede ir vacío.
    price_history: List[dict] = []
