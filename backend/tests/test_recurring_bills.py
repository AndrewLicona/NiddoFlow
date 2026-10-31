"""Pruebas del cálculo de las cuentas por pagar recurrentes."""

import os
import sys
from datetime import date

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.recurring_bills_service import next_due_date_for, _safe_day  # noqa: E402


class TestNextDueDate:
    def test_mensual_mantiene_el_dia(self):
        result = next_due_date_for("monthly", 15, reference=date(2026, 10, 1))
        assert result == date(2026, 11, 15)

    def test_mensual_cambia_de_ano(self):
        result = next_due_date_for("monthly", 10, reference=date(2026, 12, 20))
        assert result == date(2027, 1, 10)

    def test_trimestral_suma_tres_meses(self):
        result = next_due_date_for("quarterly", 5, reference=date(2026, 10, 1))
        assert result == date(2027, 1, 5)

    def test_anual_suma_un_ano(self):
        result = next_due_date_for("yearly", 20, reference=date(2026, 6, 1))
        assert result == date(2027, 6, 20)

    def test_semanal_suma_siete_dias(self):
        result = next_due_date_for("weekly", None, reference=date(2026, 10, 1))
        assert result == date(2026, 10, 8)

    def test_quincenal_suma_catorce_dias(self):
        result = next_due_date_for("biweekly", None, reference=date(2026, 10, 1))
        assert result == date(2026, 10, 15)

    def test_dia_inexistente_se_recorta(self):
        """El 31 no existe en febrero: no debe reventar."""
        result = next_due_date_for("monthly", 31, reference=date(2026, 1, 15))
        assert result == date(2026, 2, 28)

    def test_safe_day_con_bisiesto(self):
        assert _safe_day(2028, 2, 31) == date(2028, 2, 29)
        assert _safe_day(2026, 2, 31) == date(2026, 2, 28)

    def test_dia_inferior_a_uno_se_corrige(self):
        assert _safe_day(2026, 5, 0) == date(2026, 5, 1)
