"""Pruebas del scoping de presupuestos.

Este es el bug D4: el dashboard sumaba los gastos de TODOS los meses, así que
las alertas de presupuesto se disparaban con meses de atraso. Aquí se verifica
que el cálculo es correcto y que el período se respeta.
"""

import os
import sys
from datetime import date

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.budget_period import (  # noqa: E402
    budget_period_range,
    compute_budget_spent,
    iso_week_number,
    week_start,
)


def tx(amount, date_iso, category_id="cat-1", user_id=None, type="expense"):
    return {
        "id": f"tx-{date_iso}-{amount}",
        "amount": amount,
        "type": type,
        "date": date_iso,
        "category_id": category_id,
        "user_id": user_id,
    }


class TestIsoWeek:
    def test_semana_1_de_2026(self):
        # 2026-01-01 es jueves, pertenece a la semana 1
        assert iso_week_number(date(2026, 1, 1)) == 1

    def test_espacio_de_ano_sin_duplicar_semana_53(self):
        # 2021-01-01 es viernes: pertenece a la semana 53 de 2020
        assert iso_week_number(date(2021, 1, 1)) == 53
        assert iso_week_number(date(2021, 1, 4)) == 1

    def test_lunes_es_el_inicio_de_semana(self):
        monday = date(2026, 10, 5)
        sunday = date(2026, 10, 11)
        assert iso_week_number(monday) == iso_week_number(sunday)


class TestWeekStart:
    def test_lunes_de_la_semana(self):
        start = week_start(1, 2026)
        assert start.isoweekday() == 1
        assert start <= date(2026, 1, 4)

    def test_rango_crece_con_el_numero_de_semana(self):
        assert week_start(10, 2026) > week_start(5, 2026)


class TestBudgetPeriodRange:
    def test_mensual(self):
        start, end = budget_period_range({"period": "monthly", "month": 10, "year": 2026})
        assert start == date(2026, 10, 1)
        assert end == date(2026, 10, 31)

    def test_mensual_de_diciembre(self):
        start, end = budget_period_range({"period": "monthly", "month": 12, "year": 2026})
        assert end == date(2026, 12, 31)

    def test_semanal(self):
        start, end = budget_period_range({"period": "weekly", "week_number": 2, "year": 2026})
        assert end - start == date(2026, 1, 5).fromordinal(date(2026, 1, 5).toordinal() + 6) - date(2026, 1, 5)

    def test_periodo_explicito_gana(self):
        start, end = budget_period_range({
            "period": "custom", "month": 10, "year": 2026,
            "start_date": "2026-10-05", "end_date": "2026-10-20",
        })
        assert start == date(2026, 10, 5)
        assert end == date(2026, 10, 20)

    def test_sin_datos_devuelve_none(self):
        assert budget_period_range({"period": "monthly"}) is None


class TestComputeBudgetSpent:
    def test_solo_cuenta_el_mes_del_presupuesto(self):
        """Este es el corazón del bug D4: los meses anteriores NO cuentan."""
        budget = {"category_id": "cat-1", "amount": 1000.0, "period": "monthly",
                  "month": 10, "year": 2026, "user_id": None}
        transactions = [
            tx(100.0, "2026-10-05"),        # octubre -> cuenta
            tx(200.0, "2026-10-20"),        # octubre -> cuenta
            tx(500.0, "2026-09-10"),        # septiembre -> NO cuenta
            tx(700.0, "2026-11-02"),        # noviembre -> NO cuenta
        ]
        spent, percent, remaining = compute_budget_spent(budget, transactions)
        assert spent == 300.0
        assert percent == 30.0
        assert remaining == 700.0

    def test_ignora_ingresos(self):
        budget = {"category_id": "cat-1", "amount": 1000.0, "period": "monthly",
                  "month": 10, "year": 2026}
        transactions = [
            tx(100.0, "2026-10-05"),
            tx(9000.0, "2026-10-06", type="income"),
        ]
        spent, _, _ = compute_budget_spent(budget, transactions)
        assert spent == 100.0

    def test_ignora_otras_categorias(self):
        budget = {"category_id": "cat-1", "amount": 1000.0, "period": "monthly",
                  "month": 10, "year": 2026}
        transactions = [
            tx(100.0, "2026-10-05", category_id="cat-1"),
            tx(400.0, "2026-10-06", category_id="cat-2"),
        ]
        spent, _, _ = compute_budget_spent(budget, transactions)
        assert spent == 100.0

    def test_presupuesto_personal_solo_cuenta_lo_suyo(self):
        budget = {"category_id": "cat-1", "amount": 1000.0, "period": "monthly",
                  "month": 10, "year": 2026, "user_id": "user-A"}
        transactions = [
            tx(100.0, "2026-10-05", user_id="user-A"),
            tx(400.0, "2026-10-06", user_id="user-B"),
        ]
        spent, _, _ = compute_budget_spent(budget, transactions)
        assert spent == 100.0

    def test_presupuesto_familiar_cuenta_todos(self):
        budget = {"category_id": "cat-1", "amount": 1000.0, "period": "monthly",
                  "month": 10, "year": 2026, "user_id": None}
        transactions = [
            tx(100.0, "2026-10-05", user_id="user-A"),
            tx(400.0, "2026-10-06", user_id="user-B"),
        ]
        spent, _, _ = compute_budget_spent(budget, transactions)
        assert spent == 500.0

    def test_presupuesto_semanal(self):
        budget = {"category_id": "cat-1", "amount": 500.0, "period": "weekly",
                  "week_number": iso_week_number(date(2026, 10, 7)), "year": 2026}
        start = week_start(iso_week_number(date(2026, 10, 7)), 2026)
        inside = start.isoformat()
        transactions = [
            tx(50.0, inside),
            tx(80.0, (start.replace(day=start.day + 7)).isoformat()),  # semana siguiente
        ]
        spent, _, _ = compute_budget_spent(budget, transactions)
        assert spent == 50.0

    def test_periodo_explicito(self):
        budget = {"category_id": "cat-1", "amount": 1000.0, "period": "custom",
                  "start_date": "2026-10-05", "end_date": "2026-10-20"}
        transactions = [
            tx(100.0, "2026-10-06"),
            tx(900.0, "2026-10-25"),
        ]
        spent, _, _ = compute_budget_spent(budget, transactions)
        assert spent == 100.0

    def test_presupuesto_sin_periodo_no_gasta(self):
        budget = {"category_id": "cat-1", "amount": 1000.0, "period": "monthly"}
        spent, percent, remaining = compute_budget_spent(budget, [tx(100.0, "2026-10-05")])
        assert spent == 0.0
        assert percent == 0.0
        assert remaining == 1000.0

    def test_porcentaje_sobre_presupuesto_cero_no_revienta(self):
        budget = {"category_id": "cat-1", "amount": 0.0, "period": "monthly",
                  "month": 10, "year": 2026}
        spent, percent, _ = compute_budget_spent(budget, [tx(100.0, "2026-10-05")])
        assert percent == 0.0
