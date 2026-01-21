import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { debtsApi } from "@/lib/api/debts.api";

export function useDebts() {
    const queryClient = useQueryClient();

    const { data, isLoading, error } = useQuery({
        queryKey: ["debts"],
        queryFn: () => debtsApi.getDebts(),
    });

    const createDebt = useMutation({
        mutationFn: debtsApi.createDebt,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["debts"] });
            queryClient.invalidateQueries({ queryKey: ["transactions"] });
            queryClient.invalidateQueries({ queryKey: ["accounts"] });
        },
    });

    const updateDebt = useMutation({
        mutationFn: ({ id, data }: { id: string; data: any }) => debtsApi.updateDebt(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["debts"] });
        },
    });

    const deleteDebt = useMutation({
        mutationFn: debtsApi.deleteDebt,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["debts"] });
        },
    });

    const payDebt = useMutation({
        mutationFn: ({ id, data }: { id: string; data: any }) => debtsApi.payDebt(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["debts"] });
            queryClient.invalidateQueries({ queryKey: ["transactions"] });
            queryClient.invalidateQueries({ queryKey: ["accounts"] });
            queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        },
    });

    return {
        debts: data || [],
        isLoading,
        error,
        createDebt,
        updateDebt,
        deleteDebt,
        payDebt,
    };
}
