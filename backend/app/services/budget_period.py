"""Cálculo del período de un presupuesto y de lo gastado.

Este módulo es la ÚNICA fuente de verdad del scoping de presupuestos.
Replica exactamente la lógica que tenía el frontend en
`frontend/src/app/budgets/BudgetClient.tsx` (líneas 104-162), que es la
implementación que ya era correcta. Al moverla al servidor:

* el dashboard y la página de presupuestos muestran los MISMOS números
  (antes el dashboard sumaba gastos sin acotar por mes: bug D4),
* la IA puede ver el gasto real de cada presupuesto (antes siempre veía $0
  porque el campo `spent` no existía en el modelo),
* deja de haber dos implementaciones que puedan divergir.
"""

from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple


def iso_week_number(value: date) -> int:
    """Número de semana ISO. Equivale a `getWeekNumber` del frontend.

    La semana empieza en lunes y la semana 1 es la que contiene el 4 de
    enero (norma ISO 8601).
    """
    d = date(value.year, value.month, value.day)
    # El lunes de la semana actual
    d = d - timedelta(days=d.isoweekday() - 1)
    # El jueves de esa semana decide el año ISO
    iso_year = d.isocalendar()[0]
    jan4 = date(iso_year, 1, 4)
    week1_monday = jan4 - timedelta(days=jan4.isoweekday() - 1)
    return ((d - week1_monday).days // 7) + 1


def iso_year(value: date) -> int:
    """Año ISO de una fecha (puede diferir del año calendario)."""
    d = date(value.year, value.month, value.day)
    d = d - timedelta(days=d.isoweekday() - 1)
    # El jueves de la semana decide el año ISO
    return (d + timedelta(days=3)).isocalendar()[0]


def week_start(week: int, year: int) -> date:
    """Primer día (lunes) de la semana ISO `week` del año ISO `year`.

    Equivale a `date.fromisocalendar(year, week, 1)`. Cuando la semana no
    pertenece a ese año ISO (por ejemplo la semana 53, que solo existe en
    algunos años), se busca en los años vecinos.
    """
    for candidate_year in (year, year - 1, year + 1):
        try:
            return date.fromisocalendar(candidate_year, week, 1)
        except ValueError:
            continue

    # Último recurso: la semana que contiene el 1 de enero.
    anchor = date(year, 1, 1)
    return anchor - timedelta(days=anchor.isoweekday() - 1) + timedelta(days=(week - 1) * 7)


def budget_period_range(budget: Dict[str, Any]) -> Optional[Tuple[date, date]]:
    """Rango de fechas que cubre un presupuesto.

    Devuelve None si el presupuesto no tiene un período determinable
    (por ejemplo, un presupuesto mensual sin `month` ni `year`).
    """
    start_date = budget.get("start_date")
    end_date = budget.get("end_date")

    # 1) Período explícito (custom)
    if start_date and end_date:
        return _to_date(start_date), _to_date(end_date)

    period = (budget.get("period") or "monthly").lower()
    year = budget.get("year")

    # 2) Semanal
    if period == "weekly":
        week = budget.get("week_number") or iso_week_number(date.today())
        if not year:
            return None
        start = week_start(int(week), int(year))
        return start, start + timedelta(days=6)

    # 3) Mensual (por defecto)
    month = budget.get("month")
    if not year or not month:
        return None
    year, month = int(year), int(month)
    start = date(year, month, 1)
    if month == 12:
        end = date(year, 12, 31)
    else:
        end = date(year, month + 1, 1) - timedelta(days=1)
    return start, end


def _to_date(value: Any) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value)
    return datetime.fromisoformat(text.replace("Z", "+00:00")).date()


def compute_budget_spent(
    budget: Dict[str, Any],
    transactions: List[Dict[str, Any]],
) -> Tuple[float, float, float]:
    """Calcula (gastado, porcentaje, restante) de un presupuesto.

    Reglas:
    * solo se cuentan gastos (`type == 'expense'`);
    * solo los de la categoría del presupuesto;
    * si el presupuesto es personal (`user_id` informado), solo los movimientos
      de ese miembro;
    * el rango de fechas es el del período del presupuesto.
    """
    amount = float(budget.get("amount") or 0)
    period = budget_period_range(budget)
    if period is None:
        return 0.0, 0.0, amount

    start, end = period
    category_id = budget.get("category_id")
    budget_user_id = budget.get("user_id")

    spent = 0.0
    for tx in transactions:
        if tx.get("type") != "expense":
            continue
        if category_id and str(tx.get("category_id")) != str(category_id):
            continue
        # Presupuesto personal: solo los movimientos de su dueño.
        if budget_user_id and str(tx.get("user_id")) != str(budget_user_id):
            continue

        tx_date = _to_date(tx.get("date")) if tx.get("date") else None
        if tx_date is None:
            continue
        if not (start <= tx_date <= end):
            continue

        spent += float(tx.get("amount") or 0)

    percent = (spent / amount * 100) if amount > 0 else 0.0
    return spent, percent, amount - spent
