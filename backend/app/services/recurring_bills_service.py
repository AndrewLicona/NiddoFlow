"""Servicio de las cuentas por pagar recurrentes del hogar."""

import logging
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional

from app.models.recurring_bill import (
    RecurringBillCreate,
    RecurringBillResponse,
    RecurringBillUpdate,
    RecurringBillsSummary,
)
from app.repositories.recurring_bills_repository import RecurringBillsRepository

logger = logging.getLogger(__name__)

# Cuántos meses equivalen a un mes, para normalizar el costo.
CADENCE_MONTHS = {
    'weekly': 52 / 12,
    'biweekly': 26 / 12,
    'monthly': 1.0,
    'quarterly': 1 / 3,
    'yearly': 1 / 12,
}


def next_due_date_for(
    cadence: str,
    day_of_month: Optional[int],
    reference: Optional[date] = None,
) -> date:
    """Calcula la próxima fecha de cobro a partir del día de cobro."""
    ref = reference or date.today()

    if cadence == 'weekly':
        return ref + timedelta(days=7)
    if cadence == 'biweekly':
        return ref + timedelta(days=14)
    if cadence == 'yearly':
        target = day_of_month or ref.day
        year = ref.year + 1
        return _safe_day(year, ref.month, target)

    if cadence == 'quarterly':
        months = 3
    else:
        months = 1

    target = day_of_month or ref.day
    year, month = ref.year, ref.month + months
    year += (month - 1) // 12
    month = (month - 1) % 12 + 1
    return _safe_day(year, month, target)


def _safe_day(year: int, month: int, day: int) -> date:
    """Construye una fecha recortando el día si el mes es más corto."""
    import calendar
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(max(day, 1), last_day))


class RecurringBillsService:

    def __init__(self, repository: RecurringBillsRepository):
        self.repository = repository

    async def get_bills(self, user_id: str) -> RecurringBillsSummary:
        profile_res = await self.repository.get_user_profile(user_id)
        if not profile_res.data or not profile_res.data[0].get('family_id'):
            return RecurringBillsSummary()

        family_id = profile_res.data[0]['family_id']
        res = await self.repository.get_bills_by_family(family_id)
        rows = res.data or []

        categories = await self.repository.get_categories_by_family(family_id)
        category_names = {c['id']: c['name'] for c in categories}

        bills = [self._enrich(row, category_names) for row in rows]
        bills.sort(key=lambda b: (b.next_due_date is None, b.next_due_date or date.max))

        today = date.today()
        active = [b for b in bills if b.is_active]

        return RecurringBillsSummary(
            bills=bills,
            total_monthly=round(sum(b.monthly_equivalent for b in active), 2),
            due_next_7_days=[
                b for b in active
                if b.next_due_date and 0 <= (b.next_due_date - today).days <= 7
            ],
            overdue=[b for b in active if b.is_overdue],
        )

    async def create_bill(self, user_id: str, data: RecurringBillCreate) -> dict:
        profile_res = await self.repository.get_user_profile(user_id)
        if not profile_res.data or not profile_res.data[0].get('family_id'):
            raise Exception("El usuario no pertenece a ninguna familia.")

        family_id = profile_res.data[0]['family_id']
        payload = data.model_dump()
        payload['family_id'] = family_id
        payload['created_by'] = user_id
        if payload.get('category_id'):
            payload['category_id'] = str(payload['category_id'])
        if not payload.get('next_due_date'):
            payload['next_due_date'] = next_due_date_for(
                payload.get('cadence', 'monthly'), payload.get('day_of_month')
            ).isoformat()

        res = await self.repository.insert_bill(payload)
        if not res.data:
            raise Exception("No se pudo crear la cuenta por pagar")
        return res.data[0]

    async def update_bill(self, user_id: str, bill_id: str, updates: RecurringBillUpdate) -> dict:
        profile_res = await self.repository.get_user_profile(user_id)
        family_id = profile_res.data[0].get('family_id') if profile_res.data else None
        if not family_id:
            raise Exception("El usuario no pertenece a ninguna familia.")

        existing = await self.repository.get_bill_by_id(bill_id, family_id)
        if not existing:
            raise Exception("Cuenta por pagar no encontrada")

        data = updates.model_dump(exclude_unset=True)
        if data.get('category_id'):
            data['category_id'] = str(data['category_id'])

        res = await self.repository.update_bill(bill_id, family_id, data)
        if not res.data:
            raise Exception("No se pudo actualizar la cuenta por pagar")
        return res.data[0]

    async def delete_bill(self, user_id: str, bill_id: str) -> bool:
        profile_res = await self.repository.get_user_profile(user_id)
        family_id = profile_res.data[0].get('family_id') if profile_res.data else None
        if not family_id:
            raise Exception("El usuario no pertenece a ninguna familia.")

        await self.repository.delete_bill(bill_id, family_id)
        return True

    # ------------------------------------------------------------------

    def _enrich(self, row: Dict, category_names: Dict[str, str]) -> RecurringBillResponse:
        amount = float(row.get('amount') or 0)
        cadence = row.get('cadence') or 'monthly'
        monthly = amount * CADENCE_MONTHS.get(cadence, 1.0)

        due = row.get('next_due_date')
        days_until = None
        overdue = False
        if due:
            if isinstance(due, str):
                try:
                    due = datetime.fromisoformat(due.replace('Z', '+00:00')).date()
                except ValueError:
                    due = None
            elif isinstance(due, datetime):
                due = due.date()
            if due:
                days_until = (due - date.today()).days
                overdue = days_until < 0

        return RecurringBillResponse(
            id=row['id'],
            family_id=row['family_id'],
            created_by=row.get('created_by'),
            created_at=row.get('created_at') or datetime.utcnow(),
            name=row.get('name') or 'Sin nombre',
            amount=amount,
            cadence=cadence,
            day_of_month=row.get('day_of_month'),
            next_due_date=due,
            category_id=row.get('category_id'),
            category_name=category_names.get(row.get('category_id')),
            is_active=bool(row.get('is_active', True)),
            notes=row.get('notes'),
            days_until_due=days_until,
            monthly_equivalent=round(monthly, 2),
            is_overdue=overdue,
        )
