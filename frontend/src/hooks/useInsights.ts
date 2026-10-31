"use client";

import { useQuery } from "@tanstack/react-query";
import {
    currentMonthKey,
    insightsApi,
    type InsightsResponse,
    type InsightsScope,
} from "@/lib/api/insights.api";

/**
 * Datos de inteligencia del mes, calculados por el servidor (`/insights`).
 *
 * Es la única fuente de verdad de los agregados del dashboard: budgets con su
 * `spent` real, gasto por categoría/miembro, recurrentes, anomalías y flujo de
 * caja. El cliente no recalcula nada.
 */
export function useInsights(scope: InsightsScope = "family", month?: string) {
    const resolvedMonth = month ?? currentMonthKey();

    const { data, isLoading, isError, error, refetch } = useQuery<InsightsResponse>({
        queryKey: ["insights", scope, resolvedMonth],
        queryFn: () => insightsApi.getInsights(scope, resolvedMonth),
        staleTime: 60_000,
    });

    return {
        insights: data ?? null,
        month: data?.month ?? resolvedMonth,
        scope: data?.scope ?? scope,
        totals: data?.totals ?? null,
        byCategory: data?.by_category ?? [],
        byMember: data?.by_member ?? [],
        byAccount: data?.by_account ?? [],
        budgets: data?.budgets ?? [],
        topMerchants: data?.top_merchants ?? [],
        recurring: data?.recurring ?? [],
        anomalies: data?.anomalies ?? [],
        cashflow: data?.cashflow ?? null,
        isLoading,
        isError,
        error,
        refetch,
    };
}
