"""Verificación cruzada de la semana ISO entre backend y frontend.

El backend (`app/services/budget_period.py`) y el frontend
(`frontend/src/utils/date.ts`) deben aplicar EXACTAMENTE la misma convención
ISO 8601. Si divergen, un presupuesto semanal del dashboard y el de la página
de presupuestos mostrarían gastOS distintos.

Este script recorre 2018-2030 y compara, para cada fecha:
  * `iso_week_number` (backend)  vs  el algoritmo ISO de referencia
  * `week_start` (backend)        vs  `date.fromisocalendar`
  * `week_start` (backend)        vs  una réplica del `getStartOfWeek` nuevo
    del frontend (misma fórmula, replicada en Python)

Uso:  python tests/verify_iso_week.py
Salida: 0 si todo coincide, 1 si hay discrepancias.
"""

import datetime
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.budget_period import iso_week_number, iso_year, week_start  # noqa: E402


def frontend_get_week_number(d: datetime.date) -> int:
    """Réplica de `getWeekNumber` de frontend/src/utils/date.ts."""
    d = datetime.date(d.year, d.month, d.day)
    day_num = d.isoweekday()                 # 1=lunes ... 7=domingo
    d = d + datetime.timedelta(days=4 - day_num)
    year_start = datetime.date(d.year, 1, 1)
    return -(-((d - year_start).days + 1) // 7)   # ceil


def frontend_get_iso_year(d: datetime.date) -> int:
    """Réplica de `getIsoYear` de frontend/src/utils/date.ts."""
    d = datetime.date(d.year, d.month, d.day)
    day_num = d.isoweekday()
    d = d + datetime.timedelta(days=4 - day_num)
    return d.year


def frontend_get_start_of_week(week: int, year: int) -> datetime.date:
    """Réplica de `getStartOfWeek` de frontend/src/utils/date.ts."""
    for candidate_year in (year, year - 1, year + 1):
        jan4 = datetime.date(candidate_year, 1, 4)
        day_num = jan4.isoweekday()                 # lunes=1 ... domingo=7
        # new Date(year, 0, 4 - (dayNum - 1))
        day_of_month = 4 - (day_num - 1)
        week1_monday = datetime.date(candidate_year, 1, 1) + datetime.timedelta(
            days=day_of_month - 1
        )
        result = week1_monday + datetime.timedelta(days=(week - 1) * 7)
        if frontend_get_week_number(result) == week:
            return result

    anchor = datetime.date(year, 1, 1)
    monday = anchor - datetime.timedelta(days=anchor.isoweekday() - 1)
    return monday + datetime.timedelta(days=(week - 1) * 7)


def main() -> int:
    errors = 0
    d = datetime.date(2018, 1, 1)
    end = datetime.date(2030, 12, 31)

    while d <= end:
        expected_week = d.isocalendar()[1]
        expected_year = d.isocalendar()[0]

        if iso_week_number(d) != expected_week:
            print(f"iso_week_number {d}: {iso_week_number(d)} != {expected_week}")
            errors += 1
        if iso_year(d) != expected_year:
            print(f"iso_year {d}: {iso_year(d)} != {expected_year}")
            errors += 1
        if frontend_get_week_number(d) != expected_week:
            print(f"frontend getWeekNumber {d}: {frontend_get_week_number(d)} != {expected_week}")
            errors += 1

        # El lunes calculado por el backend debe caer en esa semana ISO.
        monday = week_start(expected_week, expected_year)
        if monday.isocalendar()[1] != expected_week or monday.isoweekday() != 1:
            print(f"week_start({expected_week}, {expected_year}) = {monday} {monday.isocalendar()}")
            errors += 1

        # Backend y frontend deben coincidir.
        fe = frontend_get_start_of_week(expected_week, expected_year)
        if fe != monday:
            print(f"DIVERGENCIA backend={monday} frontend={fe} (semana {expected_week}/{expected_year})")
            errors += 1

        d += datetime.timedelta(days=1)

        if errors > 20:
            print("Demasiadas discrepancias, abortando.")
            break

    print(f"Verificación ISO 2018-2030: {errors} discrepancias")

    # Casos límite de fin de año, donde las convenciones suelen divergir.
    print("\n-- casos límite --")
    for wk, yr in [(1, 2019), (1, 2020), (1, 2021), (1, 2022), (1, 2023), (1, 2024),
                   (1, 2025), (1, 2026), (1, 2027), (2, 2026), (10, 2026),
                   (30, 2026), (52, 2020), (53, 2020)]:
        be = week_start(wk, yr)
        fe = frontend_get_start_of_week(wk, yr)
        flag = "OK " if be == fe else "DIF"
        print(f"{flag} semana {wk}/{yr}: backend={be} frontend={fe} iso={be.isocalendar()}")

    return 0 if errors == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
