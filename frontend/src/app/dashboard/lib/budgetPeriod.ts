import { getIsoYear, getWeekNumber } from "@/utils/date";

/**
 * Filtro de período de un presupuesto para la interfaz del dashboard.
 *
 * El scoping de lo GASTADO no vive aquí: lo calcula el servidor
 * (`backend/app/services/budget_period.py`) y llega en `spent`/`percent`/`status`.
 * Lo único que hace el cliente es decidir qué presupuestos son los del período
 * actual, para no mostrar avisos de meses pasados.
 */

export interface PeriodBudget {
    period?: string | null;
    month?: number | null;
    year?: number | null;
    week_number?: number | null;
    start_date?: string | null;
    end_date?: string | null;
}

/** ¿El presupuesto está vigente hoy (período explícito, semanal o mensual)? */
export function isBudgetActiveNow(budget: PeriodBudget, today: Date = new Date()): boolean {
    if (budget.start_date && budget.end_date) {
        const start = new Date(budget.start_date);
        const end = new Date(budget.end_date);
        end.setHours(23, 59, 59, 999);
        return today >= start && today <= end;
    }

    const period = (budget.period || "monthly").toLowerCase();

    if (period === "weekly") {
        return (
            budget.week_number === getWeekNumber(today) &&
            budget.year === getIsoYear(today)
        );
    }

    // Mensual, quincenal y manual: se guardan con mes y año.
    // (Los quincenales y manuales además traen start_date/end_date y entran
    // por la rama de arriba.)
    return budget.month === today.getMonth() + 1 && budget.year === getIsoYear(today);
}

/** Etiqueta legible del período de un presupuesto. */
export function budgetPeriodLabel(budget: PeriodBudget): string {
    const period = (budget.period || "monthly").toLowerCase();
    if (period === "weekly") return "Semanal";
    if (period === "biweekly") return "Quincenal";
    if (period === "custom") return "Manual";
    return "Mensual";
}
