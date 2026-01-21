import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { budgetsApi } from "@/lib/api/budgets.api";

export function useBudgets(scope: string = "family") {
    const queryClient = useQueryClient();

    const { data, isLoading, error } = useQuery({
        queryKey: ["budgets", scope],
        queryFn: () => budgetsApi.getBudgets(scope),
    });

    const createBudget = useMutation({
        mutationFn: budgetsApi.createBudget,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["budgets"] });
        },
    });

    const deleteBudget = useMutation({
        mutationFn: budgetsApi.deleteBudget,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["budgets"] });
        },
    });

    return {
        budgets: data || [],
        isLoading,
        error,
        createBudget,
        deleteBudget,
    };
}
