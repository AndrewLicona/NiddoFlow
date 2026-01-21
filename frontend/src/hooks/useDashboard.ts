import { useQuery } from "@tanstack/react-query";
import { dashboardApi, DashboardStats } from "@/lib/api/dashboard.api";
import { useMemo } from "react";

export function useDashboard() {
    const { data, isLoading, error } = useQuery<DashboardStats>({
        queryKey: ["dashboard"],
        queryFn: () => dashboardApi.getStats(),
    });

    const preparedData = useMemo(() => {
        if (!data) return {
            totalBalance: 0,
            monthlyIncome: 0,
            monthlyExpense: 0,
            trends: [],
            savingsRate: 0
        };

        return {
            totalBalance: data.total_balance ?? 0,
            monthlyIncome: data.monthly_income ?? 0,
            monthlyExpense: data.monthly_expense ?? 0,
            trends: data.trends ?? [],
            savingsRate: data.monthly_income > 0
                ? ((data.monthly_income - data.monthly_expense) / data.monthly_income) * 100
                : 0
        };
    }, [data]);

    return {
        stats: data,
        preparedData,
        isLoading,
        error
    };
}
