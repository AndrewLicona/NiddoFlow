import calendar
import logging
import math
import re
import statistics
import unicodedata
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from app.models.insights import (
    InsightsAnomaly,
    InsightsBudget,
    InsightsByAccount,
    InsightsByCategory,
    InsightsByMember,
    InsightsCashflow,
    InsightsRecurring,
    InsightsResponse,
    InsightsTopMerchant,
    InsightsTotals,
)
from app.repositories.insights_repository import InsightsRepository
from app.services.base import BaseService

# Fuente de verdad compartida del scoping de presupuestos (la crea otro agente
# y la usan tanto /budgets como /insights). Si no está disponible, se usa la
# implementación local equivalente que hay más abajo en este archivo.
try:  # pragma: no cover - depende del estado del repo
    from app.services.budget_period import (  # type: ignore
        compute_budget_spent as _shared_compute_budget_spent,
    )
except Exception:  # pragma: no cover
    _shared_compute_budget_spent = None

logger = logging.getLogger(__name__)

MONTH_REGEX = re.compile(r"^(\d{4})-(0[1-9]|1[0-2])$")

# Dias aproximados de cada cadencia (para la proyeccion de caja).
CADENCE_DAYS = {
    "weekly": 7,
    "biweekly": 14,
    "monthly": 30,
    "quarterly": 91,
    "yearly": 365,
}

# Ventanas (en dias) que definen cada cadencia.
CADENCE_WINDOWS = [
    ("weekly", 5, 9),
    ("biweekly", 10, 17),
    ("monthly", 20, 45),
    ("quarterly", 60, 120),
    ("yearly", 300, 420),
]

# Umbral de variacion (en %) para considerar una anomalia de gasto.
SPIKE_THRESHOLD_PCT = 50.0
DROP_THRESHOLD_PCT = -50.0

# Umbral de gastotracked: porcentaje del presupuesto que dispara la alerta.
BUDGET_WARNING_PCT = 80.0
BUDGET_CRITICAL_PCT = 100.0

# Un gasto es "inusual" si supera este múltiplo del promedio de su categoría.
UNUSUAL_AMOUNT_FACTOR = 3.0
UNUSUAL_AMOUNT_MIN_SAMPLES = 3
UNUSUAL_AMOUNT_MAX = 3

# Historial (en meses) usado para detectar recurrentes.
RECURRING_HISTORY_MONTHS = 12

# Mínimo de repeticiones para considerar algo recurrente.
RECURRING_MIN_OCCURRENCES = 3

# Tolerancia (fracción) para considerar que el monto es "estable".
AMOUNT_STABILITY_TOLERANCE = 0.05


# ---------------------------------------------------------------------------
# Utilidades de fecha (réplica de frontend/src/utils/date.ts)
# ---------------------------------------------------------------------------
def parse_month(month: Optional[str]) -> Tuple[int, int]:
    """Parsea 'YYYY-MM'. Si es inválido devuelve el mes actual (UTC)."""
    if month:
        match = MONTH_REGEX.match(month.strip())
        if match:
            return int(match.group(1)), int(match.group(2))
    today = datetime.now(timezone.utc)
    return today.year, today.month


def month_bounds(year: int, month: int) -> Tuple[datetime, datetime]:
    """(inicio inclusivo, fin inclusivo) del mes en UTC."""
    last_day = calendar.monthrange(year, month)[1]
    start = datetime(year, month, 1, 0, 0, 0, tzinfo=timezone.utc)
    end = datetime(year, month, last_day, 23, 59, 59, 999999, tzinfo=timezone.utc)
    return start, end


def prev_month_bounds(year: int, month: int) -> Tuple[int, int]:
    """(año, mes) del mes anterior."""
    if month == 1:
        return year - 1, 12
    return year, month - 1


def get_week_number(dt: datetime) -> int:
    """Replica de `frontend/src/utils/date.ts::getWeekNumber`.

    Semana ISO (lunes = primer día), calculada sobre la fecha UTC.
    """
    d = datetime(dt.year, dt.month, dt.day, tzinfo=timezone.utc)
    day_num = d.isoweekday()  # lunes=1 ... domingo=7
    d = d + timedelta(days=4 - day_num)
    year_start = datetime(d.year, 1, 1, tzinfo=timezone.utc)
    return math.ceil((((d - year_start).days + 1) / 7))


def get_start_of_week(week: int, year: int) -> datetime:
    """Lunes de la semana ISO indicada (lunes = primer día).

    Es el inverso exacto de `get_week_number` (`date.fromisocalendar`), de modo
    que un `week_number` guardado y el rango de fechas siempre coinciden.

    Nota: `frontend/src/utils/date.ts::getStartOfWeek` tiene un desfase de un
    día cuando el día 1 del mes no es lunes (su `setDate` con valor negativo
    cuenta desde el final del mes anterior). Aquí se usa la semana ISO real,
    que es la que produce `getWeekNumber`.
    """
    try:
        monday = date.fromisocalendar(year, week, 1)
    except ValueError:
        # Ese año no tiene semana 53: se usa la última semana ISO del año.
        last_week = date(year, 12, 28).isocalendar()[1]
        monday = date.fromisocalendar(year, last_week, 1)
    return datetime(
        monday.year, monday.month, monday.day, 0, 0, 0, tzinfo=timezone.utc
    )


def normalize_merchant(text: Optional[str]) -> str:
    """Normaliza un nombre de comercio para poder agrupar."""
    if not text:
        return ""
    plain = unicodedata.normalize("NFKD", str(text))
    plain = "".join(ch for ch in plain if not unicodedata.combining(ch))
    plain = plain.lower().strip()
    plain = re.sub(r"[^a-z0-9]+", " ", plain)
    return re.sub(r"\s+", " ", plain).strip()


def _format_amount(value: float) -> str:
    """Formato de miles español (1.234.567) para los mensajes."""
    return f"{value:,.0f}".replace(",", ".")


def _classify_cadence(median_gap_days: float) -> Optional[str]:
    for name, low, high in CADENCE_WINDOWS:
        if low <= median_gap_days <= high:
            return name
    return None


class InsightsService(BaseService):
    """Capa de agregacion del servidor: toda la analitica se calcula aqui.

    Reglas clave (CONTRATOS_IMPLEMENTACION.md §2):
      - `totals` y `by_category` siempre acotados al mes solicitado.
      - `budgets[].spent` usa EXCLUSIVAMENTE los gastos del mes/semana del
        presupuesto (replica de `BudgetClient.tsx:110-160`).
      - `by_member` resuelve `transactions.user_id` -> `profiles.full_name`.
      - `recurring` es solo lectura: deteccion por comercio normalizado,
        monto estable y periodicidad.
    """

    def __init__(self, repository: InsightsRepository):
        super().__init__(repository)

    # ------------------------------------------------------------------
    # Punto de entrada
    # ------------------------------------------------------------------
    async def get_insights(
        self,
        user_id: str,
        scope: str = "family",
        month: Optional[str] = None,
    ) -> InsightsResponse:
        scope = (scope or "family").strip().lower()
        if scope not in ("family", "personal"):
            scope = "family"

        year, month_number = parse_month(month)
        month_key = f"{year:04d}-{month_number:02d}"
        response = self._empty_response(month_key, scope)

        try:
            profile = await self.repository.get_user_profile(user_id)
        except Exception as exc:
            logger.error("[insights] Error obteniendo el perfil: %s", exc)
            return response

        family_id = (profile or {}).get("family_id")
        if not family_id:
            logger.warning(
                "[insights] El usuario %s no pertenece a una familia: se devuelve respuesta vacia",
                user_id,
            )
            return response

        try:
            accounts = await self.repository.get_accounts(family_id, user_id, scope)
        except Exception as exc:
            logger.error("[insights] Error obteniendo las cuentas: %s", exc)
            accounts = []

        account_ids = [str(a.get("id")) for a in accounts if a.get("id")]
        if not account_ids:
            logger.info(
                "[insights] El usuario %s no tiene cuentas en el scope %s",
                user_id,
                scope,
            )
            return response

        # Ventana de analisis: 12 meses de historial (para recurrentes) + mes actual.
        month_start, month_end = month_bounds(year, month_number)
        prev_year, prev_month = prev_month_bounds(year, month_number)
        prev_start, prev_end = month_bounds(prev_year, prev_month)
        analysis_start = month_start - timedelta(days=365)

        try:
            transactions = await self.repository.get_transactions(
                family_id,
                account_ids,
                analysis_start.isoformat(),
                month_end.isoformat(),
            )
        except Exception as exc:
            logger.error("[insights] Error obteniendo las transacciones: %s", exc)
            transactions = []

        month_txs = [t for t in transactions if self._in_month(t, year, month_number)]
        prev_month_txs = [t for t in transactions if self._in_month(t, prev_year, prev_month)]

        # --- Presupuestos (cada bloque va envuelto: un fallo no rompe el resto)
        try:
            budgets_raw = await self.repository.get_budgets(family_id)
        except Exception as exc:
            logger.error("[insights] Error obteniendo los presupuestos: %s", exc)
            budgets_raw = []

        budget_txs = transactions
        try:
            budget_txs = await self._extend_for_budgets(
                family_id, account_ids, transactions, budgets_raw, analysis_start, month_end
            )
        except Exception as exc:
            logger.error("[insights] Error ampliando los datos para presupuestos: %s", exc)

        # --- Perfiles (nombres de los miembros)
        profiles_map: Dict[str, str] = {}
        try:
            user_ids = [
                str(t.get("user_id")) for t in month_txs if t.get("user_id")
            ]
            profiles = await self.repository.get_profiles(sorted(set(user_ids)))
            for p in profiles or []:
                pid = p.get("id")
                if pid:
                    profiles_map[str(pid)] = p.get("full_name") or "Sin asignar"
        except Exception as exc:
            logger.error("[insights] Error obteniendo los perfiles: %s", exc)

        # --- Cada bloque de calculo va protegido
        try:
            response.totals = self._compute_totals(month_txs, prev_month_txs)
        except Exception as exc:
            logger.error("[insights] Error calculando totales: %s", exc)

        try:
            response.by_category = self._compute_by_category(month_txs, prev_month_txs)
        except Exception as exc:
            logger.error("[insights] Error calculando by_category: %s", exc)

        try:
            response.by_member = self._compute_by_member(month_txs, profiles_map)
        except Exception as exc:
            logger.error("[insights] Error calculando by_member: %s", exc)

        try:
            response.by_account = self._compute_by_account(month_txs, accounts)
        except Exception as exc:
            logger.error("[insights] Error calculando by_account: %s", exc)

        try:
            response.budgets = self._compute_budgets(budgets_raw, budget_txs)
        except Exception as exc:
            logger.error("[insights] Error calculando budgets: %s", exc)

        try:
            response.top_merchants = self._compute_top_merchants(month_txs)
        except Exception as exc:
            logger.error("[insights] Error calculando top_merchants: %s", exc)

        try:
            response.recurring = self._compute_recurring(transactions)
        except Exception as exc:
            logger.error("[insights] Error calculando recurring: %s", exc)

        try:
            response.anomalies = self._compute_anomalies(
                month_txs, prev_month_txs, response.by_category, response.budgets
            )
        except Exception as exc:
            logger.error("[insights] Error calculando anomalies: %s", exc)

        try:
            response.cashflow = self._compute_cashflow(
                accounts, month_txs, response.recurring, year, month_number
            )
        except Exception as exc:
            logger.error("[insights] Error calculando cashflow: %s", exc)

        # price_history: lo pueblan los agentes B/C. Puede ir vacío.
        response.price_history = []

        return response

    # ------------------------------------------------------------------
    # Utilidades internas
    # ------------------------------------------------------------------
    @staticmethod
    def _empty_response(month: str, scope: str) -> InsightsResponse:
        return InsightsResponse(
            month=month,
            scope=scope,
            totals=InsightsTotals(),
            by_category=[],
            by_member=[],
            by_account=[],
            budgets=[],
            top_merchants=[],
            recurring=[],
            anomalies=[],
            cashflow=InsightsCashflow(),
            price_history=[],
        )

    @staticmethod
    def _to_datetime(value: Any) -> Optional[datetime]:
        if isinstance(value, datetime):
            dt = value
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc)
        if isinstance(value, date):
            return datetime(
                value.year, value.month, value.day, tzinfo=timezone.utc
            )
        if isinstance(value, str) and value:
            try:
                dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt.astimezone(timezone.utc)
            except ValueError:
                return None
        return None

    @classmethod
    def _tx_datetime(cls, tx: Dict[str, Any]) -> Optional[datetime]:
        return cls._to_datetime(tx.get("date"))

    @classmethod
    def _in_month(cls, tx: Dict[str, Any], year: int, month: int) -> bool:
        dt = cls._tx_datetime(tx)
        if dt is None:
            return False
        return dt.year == year and dt.month == month

    @staticmethod
    def _amount(tx: Dict[str, Any]) -> float:
        try:
            return float(tx.get("amount") or 0)
        except (TypeError, ValueError):
            return 0.0

    @staticmethod
    def _type(tx: Dict[str, Any]) -> str:
        return str(tx.get("type") or "").lower()

    @staticmethod
    def _related(record: Dict[str, Any], key: str) -> Dict[str, Any]:
        value = record.get(key)
        if isinstance(value, dict):
            return value
        if isinstance(value, list) and value and isinstance(value[0], dict):
            return value[0]
        return {}

    @classmethod
    def _category_of(cls, tx: Dict[str, Any]) -> Tuple[Optional[str], Optional[str]]:
        """(category_id, category_name) de una transaccion."""
        category = cls._related(tx, "category")
        category_id = category.get("id") or tx.get("category_id")
        name = category.get("name")
        return (str(category_id) if category_id else None), name

    @classmethod
    def _merchant_name(cls, tx: Dict[str, Any]) -> str:
        """Comercio: usa la columna `merchant` si existe, si no la descripción."""
        merchant = tx.get("merchant")
        if isinstance(merchant, str) and merchant.strip():
            return merchant.strip()
        description = tx.get("description")
        if isinstance(description, str) and description.strip():
            return description.strip()
        return ""

    # ------------------------------------------------------------------
    # Totales
    # ------------------------------------------------------------------
    def _compute_totals(
        self, month_txs: List[Dict[str, Any]], prev_month_txs: List[Dict[str, Any]]
    ) -> InsightsTotals:
        income = sum(self._amount(t) for t in month_txs if self._type(t) == "income")
        expense = sum(self._amount(t) for t in month_txs if self._type(t) == "expense")
        prev_expense = sum(
            self._amount(t) for t in prev_month_txs if self._type(t) == "expense"
        )
        # Los transfers son movimientos internos: no cuentan como ingreso ni gasto.
        count = sum(1 for t in month_txs if self._type(t) in ("income", "expense"))

        balance = income - expense
        savings_rate = ((balance / income) * 100) if income > 0 else 0.0
        trend = ((expense - prev_expense) / prev_expense * 100) if prev_expense > 0 else 0.0

        return InsightsTotals(
            income=round(income, 2),
            expense=round(expense, 2),
            balance=round(balance, 2),
            savings_rate=round(savings_rate, 2),
            transaction_count=count,
            prev_month_expense=round(prev_expense, 2),
            expense_trend_pct=round(trend, 2),
        )

    # ------------------------------------------------------------------
    # By category
    # ------------------------------------------------------------------
    def _compute_by_category(
        self, month_txs: List[Dict[str, Any]], prev_month_txs: List[Dict[str, Any]]
    ) -> List[InsightsByCategory]:
        current: Dict[Optional[str], Dict[str, Any]] = {}
        previous: Dict[Optional[str], float] = defaultdict(float)

        def bucket(store: Dict[Optional[str], Dict[str, Any]], tx: Dict[str, Any]):
            category_id, category_name = self._category_of(tx)
            key = category_id
            entry = store.setdefault(
                key, {"amount": 0.0, "name": category_name or "Sin categoría"}
            )
            entry["amount"] += self._amount(tx)
            if category_name:
                entry["name"] = category_name

        for tx in month_txs:
            if self._type(tx) == "expense":
                bucket(current, tx)
        for tx in prev_month_txs:
            if self._type(tx) == "expense":
                category_id, _ = self._category_of(tx)
                previous[category_id] += self._amount(tx)

        total_expense = sum(e["amount"] for e in current.values())

        result: List[InsightsByCategory] = []
        for category_id, entry in current.items():
            amount = entry["amount"]
            pct = (amount / total_expense * 100) if total_expense > 0 else 0.0
            prev_amount = previous.get(category_id, 0.0)
            trend = ((amount - prev_amount) / prev_amount * 100) if prev_amount > 0 else 0.0
            result.append(
                InsightsByCategory(
                    category_id=category_id,
                    category=entry["name"],
                    amount=round(amount, 2),
                    pct_of_total=round(pct, 2),
                    trend_vs_last_month=round(trend, 2),
                )
            )

        result.sort(key=lambda c: c.amount, reverse=True)
        return result

    # ------------------------------------------------------------------
    # By member
    # ------------------------------------------------------------------
    def _compute_by_member(
        self, month_txs: List[Dict[str, Any]], profiles_map: Dict[str, str]
    ) -> List[InsightsByMember]:
        buckets: Dict[Optional[str], Dict[str, Any]] = {}

        for tx in month_txs:
            if self._type(tx) != "expense":
                continue
            raw_user_id = tx.get("user_id")
            user_id = str(raw_user_id) if raw_user_id else None
            entry = buckets.setdefault(
                user_id, {"amount": 0.0, "count": 0, "member": profiles_map.get(user_id)}
            )
            entry["amount"] += self._amount(tx)
            entry["count"] += 1
            if not entry["member"]:
                entry["member"] = profiles_map.get(user_id)

        result = [
            InsightsByMember(
                user_id=user_id,
                member=entry["member"] or "Sin asignar",
                amount=round(entry["amount"], 2),
                transaction_count=entry["count"],
            )
            for user_id, entry in buckets.items()
        ]
        result.sort(key=lambda m: m.amount, reverse=True)
        return result

    # ------------------------------------------------------------------
    # By account
    # ------------------------------------------------------------------
    def _compute_by_account(
        self, month_txs: List[Dict[str, Any]], accounts: List[Dict[str, Any]]
    ) -> List[InsightsByAccount]:
        accounts_map = {str(a.get("id")): a for a in accounts if a.get("id")}
        buckets: Dict[str, Dict[str, Any]] = defaultdict(
            lambda: {"amount": 0.0, "name": "", "type": ""}
        )

        for tx in month_txs:
            if self._type(tx) != "expense":
                continue
            account = self._related(tx, "account")
            account_id = str(account.get("id") or tx.get("account_id") or "")
            if not account_id:
                continue
            entry = buckets[account_id]
            entry["amount"] += self._amount(tx)
            meta = accounts_map.get(account_id, {})
            name = meta.get("name") or account.get("name") or "Cuenta"
            account_type = meta.get("type") or account.get("type") or "personal"
            entry["name"] = name
            entry["type"] = account_type

        result = [
            InsightsByAccount(
                account_id=account_id,
                account=entry["name"],
                type=entry["type"],
                amount=round(entry["amount"], 2),
            )
            for account_id, entry in buckets.items()
        ]
        result.sort(key=lambda a: a.amount, reverse=True)
        return result

    # ------------------------------------------------------------------
    # Budgets  (el calculo mas importante: replica BudgetClient.tsx)
    # ------------------------------------------------------------------
    async def _extend_for_budgets(
        self,
        family_id: str,
        account_ids: List[str],
        transactions: List[Dict[str, Any]],
        budgets: List[Dict[str, Any]],
        analysis_start: datetime,
        analysis_end: datetime,
    ) -> List[Dict[str, Any]]:
        """Si algún presupuesto cae fuera de la ventana analizada, se trae."""
        if not budgets:
            return transactions

        windows = [self._budget_window(b) for b in budgets]
        windows = [w for w in windows if w is not None]
        if not windows:
            return transactions

        min_start = min(w[0] for w in windows)
        max_end = max(w[1] for w in windows)
        if min_start >= analysis_start and max_end <= analysis_end:
            return transactions

        extra = await self.repository.get_transactions(
            family_id, account_ids, min_start.isoformat(), max_end.isoformat()
        )

        merged: Dict[str, Dict[str, Any]] = {}
        for tx in list(transactions) + list(extra or []):
            key = str(tx.get("id") or id(tx))
            merged[key] = tx
        return list(merged.values())

    def _budget_window(
        self, budget: Dict[str, Any]
    ) -> Optional[Tuple[datetime, datetime]]:
        """Rango de fechas que aplica a un presupuesto.

        Prioridad (igual que `BudgetClient.tsx`):
          1. `start_date` + `end_date` si existen.
          2. `period == 'weekly'` -> la semana ISO (`week_number` + `year`).
          3. cualquier otro periodo -> mes + año.
        """
        start_date = self._to_datetime(budget.get("start_date"))
        end_date = self._to_datetime(budget.get("end_date"))

        if start_date and end_date:
            start = datetime(
                start_date.year, start_date.month, start_date.day, tzinfo=timezone.utc
            )
            end = datetime(
                end_date.year,
                end_date.month,
                end_date.day,
                23,
                59,
                59,
                999999,
                tzinfo=timezone.utc,
            )
            return (start, end)

        period = str(budget.get("period") or "monthly").lower()
        year = budget.get("year")
        try:
            year = int(year)
        except (TypeError, ValueError):
            return None

        if period == "weekly":
            week = budget.get("week_number")
            try:
                week = int(week)
            except (TypeError, ValueError):
                # Igual que el frontend: si no hay semana, se usa la actual.
                week = get_week_number(datetime.now(timezone.utc))
            if week < 1 or week > 53:
                return None
            start = get_start_of_week(week, year)
            end = start + timedelta(days=6)
            end = end.replace(hour=23, minute=59, second=59, microsecond=999999)
            return (start, end)

        month = budget.get("month")
        try:
            month = int(month)
        except (TypeError, ValueError):
            logger.warning(
                "[insights] Presupuesto %s sin 'month' válido: spent = 0",
                budget.get("id"),
            )
            return None
        if month < 1 or month > 12:
            return None
        return month_bounds(year, month)

    def _compute_budgets(
        self, budgets: List[Dict[str, Any]], transactions: List[Dict[str, Any]]
    ) -> List[InsightsBudget]:
        result: List[InsightsBudget] = []

        for budget in budgets or []:
            try:
                category = self._related(budget, "category")
                category_id = str(category.get("id") or budget.get("category_id") or "")
                category_name = category.get("name") or "General"
                amount = float(budget.get("amount") or 0)

                spent, percent = self._budget_spent(budget, transactions)
                if amount <= 0:
                    percent = 0.0

                if percent >= BUDGET_CRITICAL_PCT:
                    status = "critical"
                elif percent >= BUDGET_WARNING_PCT:
                    status = "warning"
                else:
                    status = "ok"

                result.append(
                    InsightsBudget(
                        budget_id=str(budget.get("id") or ""),
                        category_id=category_id,
                        category=category_name,
                        amount=round(amount, 2),
                        spent=round(spent, 2),
                        percent=round(percent, 2),
                        status=status,
                        period=str(budget.get("period") or "monthly"),
                    )
                )
            except Exception as exc:
                logger.error(
                    "[insights] Error calculando el presupuesto %s: %s",
                    budget.get("id"),
                    exc,
                )

        result.sort(key=lambda b: b.percent, reverse=True)
        return result

    def _budget_spent(
        self, budget: Dict[str, Any], transactions: List[Dict[str, Any]]
    ) -> Tuple[float, float]:
        """(gastado, porcentaje) de un presupuesto.

        Usa la fuente de verdad compartida (`budget_period.compute_budget_spent`)
        para que /insights y /budgets muestren EXACTAMENTE el mismo número.
        Si no está disponible, se usa la implementación local de abajo.
        """
        if _shared_compute_budget_spent is not None:
            try:
                spent, percent, _remaining = _shared_compute_budget_spent(
                    budget, transactions
                )
                return float(spent), float(percent)
            except Exception as exc:
                logger.warning(
                    "[insights] No se pudo usar budget_period.compute_budget_spent "
                    "(%s); se usa el cálculo local",
                    exc,
                )
        return self._budget_spent_local(budget, transactions)

    def _budget_spent_local(
        self, budget: Dict[str, Any], transactions: List[Dict[str, Any]]
    ) -> Tuple[float, float]:
        """Cálculo local equivalente (respaldo de `budget_period`)."""
        amount = float(budget.get("amount") or 0)
        window = self._budget_window(budget)
        category_id = str(budget.get("category_id") or "")
        spent = 0.0

        if window is not None and category_id:
            start, end = window
            budget_user_id = budget.get("user_id")
            budget_user_id = str(budget_user_id) if budget_user_id else None

            for tx in transactions:
                if self._type(tx) != "expense":
                    continue
                tx_category_id, _ = self._category_of(tx)
                if not tx_category_id or str(tx_category_id) != category_id:
                    continue
                # Presupuesto personal: solo los movimientos de ese miembro.
                if budget_user_id:
                    tx_user_id = tx.get("user_id")
                    if not tx_user_id or str(tx_user_id) != budget_user_id:
                        continue
                dt = self._tx_datetime(tx)
                if dt is None or dt < start or dt > end:
                    continue
                spent += self._amount(tx)

        percent = (spent / amount * 100) if amount > 0 else 0.0
        return spent, percent

    # ------------------------------------------------------------------
    # Top merchants
    # ------------------------------------------------------------------
    def _compute_top_merchants(
        self, month_txs: List[Dict[str, Any]], limit: int = 10
    ) -> List[InsightsTopMerchant]:
        buckets: Dict[str, Dict[str, Any]] = {}

        for tx in month_txs:
            if self._type(tx) != "expense":
                continue
            name = self._merchant_name(tx)
            key = normalize_merchant(name)
            if not key:
                continue
            entry = buckets.setdefault(
                key, {"amount": 0.0, "visits": 0, "names": {}}
            )
            entry["amount"] += self._amount(tx)
            entry["visits"] += 1
            entry["names"][name] = entry["names"].get(name, 0) + 1

        result: List[InsightsTopMerchant] = []
        for entry in buckets.values():
            # Nombre mas frecuente (el que el usuario reconoce).
            merchant_name = max(entry["names"].items(), key=lambda kv: kv[1])[0]
            result.append(
                InsightsTopMerchant(
                    merchant=merchant_name,
                    amount=round(entry["amount"], 2),
                    visits=entry["visits"],
                )
            )

        result.sort(key=lambda m: m.amount, reverse=True)
        return result[:limit]

    # ------------------------------------------------------------------
    # Recurrentes (solo lectura)
    # ------------------------------------------------------------------
    def _compute_recurring(
        self, transactions: List[Dict[str, Any]], limit: int = 10
    ) -> List[InsightsRecurring]:
        groups: Dict[str, List[Dict[str, Any]]] = defaultdict(list)

        for tx in transactions:
            if self._type(tx) != "expense":
                continue
            name = self._merchant_name(tx)
            key = normalize_merchant(name)
            if not key:
                continue
            dt = self._tx_datetime(tx)
            if dt is None:
                continue
            groups[key].append({"tx": tx, "date": dt, "name": name})

        result: List[InsightsRecurring] = []
        for items in groups.values():
            if len(items) < RECURRING_MIN_OCCURRENCES:
                continue
            try:
                detected = self._detect_recurring_group(items)
                if detected:
                    result.append(detected)
            except Exception as exc:
                logger.error("[insights] Error detectando un recurrente: %s", exc)

        result.sort(key=lambda r: r.confidence, reverse=True)
        return result[:limit]

    def _detect_recurring_group(
        self, items: List[Dict[str, Any]]
    ) -> Optional[InsightsRecurring]:
        items = sorted(items, key=lambda i: i["date"])
        amounts = [self._amount(i["tx"]) for i in items]
        median_amount = statistics.median(amounts)
        if median_amount <= 0:
            return None

        stable = [
            i
            for i in items
            if abs(self._amount(i["tx"]) - median_amount)
            <= median_amount * AMOUNT_STABILITY_TOLERANCE
        ]
        if len(stable) < RECURRING_MIN_OCCURRENCES:
            return None
        stability = len(stable) / len(items)

        dates = [i["date"] for i in stable]
        gaps = [
            (dates[i + 1] - dates[i]).days for i in range(len(dates) - 1)
        ]
        gaps = [g for g in gaps if g > 0]
        if not gaps:
            return None

        median_gap = statistics.median(gaps)
        cadence = _classify_cadence(median_gap)
        if not cadence:
            return None

        deviations = [abs(g - median_gap) for g in gaps]
        regularity = 1 - min(
            1.0, (statistics.mean(deviations) / median_gap) if median_gap else 1.0
        )
        count_factor = min(
            1.0, (len(stable) - (RECURRING_MIN_OCCURRENCES - 1)) / 6.0
        )
        confidence = max(
            0.0,
            min(
                1.0,
                0.35 * stability + 0.30 * regularity + 0.35 * count_factor,
            ),
        )

        names: Dict[str, int] = {}
        for item in stable:
            names[item["name"]] = names.get(item["name"], 0) + 1
        merchant_name = max(names.items(), key=lambda kv: kv[1])[0]

        return InsightsRecurring(
            merchant=merchant_name,
            amount=round(median_amount, 2),
            cadence=cadence,
            last_seen=dates[-1].strftime("%Y-%m-%d"),
            confidence=round(confidence, 2),
        )

    # ------------------------------------------------------------------
    # Anomalias
    # ------------------------------------------------------------------
    def _compute_anomalies(
        self,
        month_txs: List[Dict[str, Any]],
        prev_month_txs: List[Dict[str, Any]],
        by_category: List[InsightsByCategory],
        budgets: List[InsightsBudget],
    ) -> List[InsightsAnomaly]:
        anomalies: List[InsightsAnomaly] = []

        # 1. Variacion por categoria vs. mes anterior
        previous: Dict[Optional[str], float] = defaultdict(float)
        for tx in prev_month_txs:
            if self._type(tx) != "expense":
                continue
            category_id, _ = self._category_of(tx)
            previous[category_id] += self._amount(tx)

        for category in by_category:
            prev_amount = previous.get(category.category_id, 0.0)
            if prev_amount <= 0:
                continue
            variation = (category.amount - prev_amount) / prev_amount * 100
            if variation >= SPIKE_THRESHOLD_PCT:
                anomalies.append(
                    InsightsAnomaly(
                        kind="category_spike",
                        category=category.category,
                        message=(
                            f"{category.category} lleva {variation:.0f}% más que el mes anterior"
                        ),
                        severity="critical" if variation >= 100 else "warning",
                    )
                )
            elif variation <= DROP_THRESHOLD_PCT:
                anomalies.append(
                    InsightsAnomaly(
                        kind="category_drop",
                        category=category.category,
                        message=(
                            f"{category.category} lleva {abs(variation):.0f}% menos que el mes anterior"
                        ),
                        severity="info",
                    )
                )

        # 2. Presupuestos en >80% / >=100%
        for budget in budgets:
            if budget.percent >= BUDGET_CRITICAL_PCT:
                anomalies.append(
                    InsightsAnomaly(
                        kind="budget_critical",
                        category=budget.category,
                        message=(
                            f"{budget.category} superó su presupuesto "
                            f"({budget.percent:.0f}%, {_format_amount(budget.spent)} "
                            f"de {_format_amount(budget.amount)})"
                        ),
                        severity="critical",
                    )
                )
            elif budget.percent >= BUDGET_WARNING_PCT:
                anomalies.append(
                    InsightsAnomaly(
                        kind="budget_critical",
                        category=budget.category,
                        message=(
                            f"{budget.category} va en {budget.percent:.0f}% de su presupuesto "
                            f"({_format_amount(budget.spent)} de {_format_amount(budget.amount)})"
                        ),
                        severity="warning",
                    )
                )

        # 3. Gastos inusuales dentro de su categoría
        anomalies.extend(self._detect_unusual_amounts(month_txs))

        order = {"critical": 0, "warning": 1, "info": 2}
        anomalies.sort(key=lambda a: order.get(a.severity, 3))
        return anomalies

    def _detect_unusual_amounts(
        self, month_txs: List[Dict[str, Any]]
    ) -> List[InsightsAnomaly]:
        by_category: Dict[Optional[str], List[Dict[str, Any]]] = defaultdict(list)
        for tx in month_txs:
            if self._type(tx) != "expense":
                continue
            category_id, category_name = self._category_of(tx)
            by_category[category_id].append(
                {"tx": tx, "name": category_name or "Sin categoría"}
            )

        found: List[InsightsAnomaly] = []
        for category_id, items in by_category.items():
            if len(items) < UNUSUAL_AMOUNT_MIN_SAMPLES:
                continue
            amounts = [self._amount(i["tx"]) for i in items]
            average = sum(amounts) / len(amounts)
            if average <= 0:
                continue
            for item in items:
                amount = self._amount(item["tx"])
                if amount > average * UNUSUAL_AMOUNT_FACTOR:
                    description = self._merchant_name(item["tx"]) or "Movimiento"
                    found.append(
                        InsightsAnomaly(
                            kind="unusual_amount",
                            category=item["name"],
                            message=(
                                f"{description} fue un gasto inusual de "
                                f"{_format_amount(amount)} en {item['name']} "
                                f"({_format_amount(average)} es el promedio)"
                            ),
                            severity="warning",
                        )
                    )

        found.sort(key=lambda a: a.message, reverse=True)
        return found[:UNUSUAL_AMOUNT_MAX]

    # ------------------------------------------------------------------
    # Cashflow
    # ------------------------------------------------------------------
    def _compute_cashflow(
        self,
        accounts: List[Dict[str, Any]],
        month_txs: List[Dict[str, Any]],
        recurring: List[InsightsRecurring],
        year: int,
        month: int,
    ) -> InsightsCashflow:
        balance_now = 0.0
        for account in accounts:
            try:
                balance_now += float(account.get("balance") or 0)
            except (TypeError, ValueError):
                continue

        days_in_month = calendar.monthrange(year, month)[1]
        today = datetime.now(timezone.utc)
        if (today.year, today.month) == (year, month):
            days_elapsed = today.day
        elif (today.year, today.month) > (year, month):
            days_elapsed = days_in_month
        else:
            days_elapsed = 0
        days_remaining = max(0, days_in_month - days_elapsed)

        income = sum(self._amount(t) for t in month_txs if self._type(t) == "income")
        expense = sum(self._amount(t) for t in month_txs if self._type(t) == "expense")

        daily_avg_spend = (expense / days_elapsed) if days_elapsed > 0 else 0.0
        daily_avg_income = (income / days_elapsed) if days_elapsed > 0 else 0.0

        # Gasto recurrente: lo ya pagado + lo que falta segun su cadencia.
        recurring_keys = {normalize_merchant(r.merchant) for r in recurring}
        recurring_paid = 0.0
        non_recurring_paid = 0.0
        for tx in month_txs:
            if self._type(tx) != "expense":
                continue
            key = normalize_merchant(self._merchant_name(tx))
            if key and key in recurring_keys:
                recurring_paid += self._amount(tx)
            else:
                non_recurring_paid += self._amount(tx)

        recurring_remaining = 0.0
        for item in recurring:
            cadence_days = CADENCE_DAYS.get(item.cadence, 30)
            occurrences = days_remaining / cadence_days if cadence_days else 0
            recurring_remaining += item.amount * occurrences

        projected_spend = recurring_paid + recurring_remaining
        if days_elapsed > 0:
            projected_spend += (non_recurring_paid / days_elapsed) * days_remaining

        projected_income = daily_avg_income * days_remaining
        projected_end = balance_now + projected_income - projected_spend

        days_of_expense_remaining = (
            (balance_now / daily_avg_spend) if daily_avg_spend > 0 else 0.0
        )

        return InsightsCashflow(
            projected_end_of_month=round(projected_end, 2),
            daily_avg_spend=round(daily_avg_spend, 2),
            days_of_expense_remaining=round(max(0.0, days_of_expense_remaining), 2),
        )
