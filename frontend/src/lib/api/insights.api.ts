import { fetchWithAuth } from "./client";

/**
 * Contrato de `/insights` (CONTRATOS_IMPLEMENTACION.md §2).
 *
 * La forma de estos tipos es la EXACTA que devuelve el backend
 * (`backend/app/models/insights.py`). Toda la agregación (totales, gasto por
 * categoría/miembro/cuenta, presupuesto gastado, recurrentes, anomalías y flujo
 * de caja) se calcula en el servidor; aquí solo se tipa y se transporta.
 */

export type InsightsScope = "family" | "personal";

export type BudgetStatus = "ok" | "warning" | "critical";

export type AnomalySeverity = "info" | "warning" | "critical";

export type AnomalyKind =
    | "category_spike"
    | "category_drop"
    | "budget_critical"
    | "unusual_amount";

export type RecurringCadence = "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";

export interface InsightsTotals {
    income: number;
    expense: number;
    balance: number;
    savings_rate: number;
    transaction_count: number;
    prev_month_expense: number;
    expense_trend_pct: number;
}

export interface InsightsByCategory {
    category_id: string | null;
    category: string;
    amount: number;
    pct_of_total: number;
    trend_vs_last_month: number;
}

export interface InsightsByMember {
    user_id: string | null;
    member: string;
    amount: number;
    transaction_count: number;
}

export interface InsightsByAccount {
    account_id: string;
    account: string;
    type: string;
    amount: number;
}

export interface InsightsBudget {
    budget_id: string;
    category_id: string;
    category: string;
    amount: number;
    /** Gastado REAL del período del presupuesto (lo calcula el servidor). */
    spent: number;
    percent: number;
    status: BudgetStatus;
    period: string;
}

export interface InsightsTopMerchant {
    merchant: string;
    amount: number;
    visits: number;
}

export interface InsightsRecurring {
    merchant: string;
    amount: number;
    cadence: RecurringCadence;
    last_seen: string;
    /** Confianza de la detección (0-1). */
    confidence: number;
}

export interface InsightsAnomaly {
    kind: AnomalyKind;
    category: string;
    message: string;
    severity: AnomalySeverity;
}

export interface InsightsCashflow {
    projected_end_of_month: number;
    daily_avg_spend: number;
    days_of_expense_remaining: number;
}

export interface InsightsResponse {
    month: string;
    scope: string;
    totals: InsightsTotals;
    by_category: InsightsByCategory[];
    by_member: InsightsByMember[];
    by_account: InsightsByAccount[];
    budgets: InsightsBudget[];
    top_merchants: InsightsTopMerchant[];
    recurring: InsightsRecurring[];
    anomalies: InsightsAnomaly[];
    cashflow: InsightsCashflow;
    price_history: Record<string, unknown>[];
}

/** Mes actual en formato `YYYY-MM`, el que espera el backend. */
export function currentMonthKey(date: Date = new Date()): string {
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    return `${date.getFullYear()}-${month}`;
}

/**
 * Cuántos meses equivalen a uno según la cadencia.
 * Mismo criterio que el backend (`recurring_bills_service.py::CADENCE_MONTHS`),
 * para que el "total al mes" del panel coincida con el de Cuentas del hogar.
 */
export const CADENCE_MONTHS: Record<RecurringCadence, number> = {
    weekly: 52 / 12,
    biweekly: 26 / 12,
    monthly: 1,
    quarterly: 1 / 3,
    yearly: 1 / 12,
};

/** Normaliza un importe de pago recurrente a su equivalente mensual. */
export function monthlyEquivalent(amount: number, cadence: RecurringCadence | string): number {
    const factor = CADENCE_MONTHS[cadence as RecurringCadence];
    return amount * (factor ?? 1);
}

export const insightsApi = {
    /**
     * `GET /insights/?scope=family|personal&month=YYYY-MM`
     * Es solo lectura: si la base de datos falla, el backend responde con
     * totales en 0 y listas vacías (no rompe la interfaz).
     */
    getInsights: async (
        scope: InsightsScope = "family",
        month?: string,
        headers?: Record<string, string>
    ): Promise<InsightsResponse> => {
        const params = new URLSearchParams({ scope });
        if (month) params.append("month", month);

        return fetchWithAuth(`/insights/?${params.toString()}`, { headers }) as Promise<InsightsResponse>;
    },
};
