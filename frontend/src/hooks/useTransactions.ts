import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { transactionsApi } from "@/lib/api/transactions.api";

export function useTransactions(params: { scope?: string; limit?: number; start_date?: string; end_date?: string } = {}) {
    const queryClient = useQueryClient();

    const { data, isLoading, error } = useQuery({
        queryKey: ["transactions", params],
        queryFn: () => transactionsApi.getTransactions(params),
    });

    const createTransaction = useMutation({
        mutationFn: transactionsApi.createTransaction,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["transactions"] });
            queryClient.invalidateQueries({ queryKey: ["accounts"] });
            queryClient.invalidateQueries({ queryKey: ["dashboard"] });
            queryClient.invalidateQueries({ queryKey: ["budgets"] });
            queryClient.invalidateQueries({ queryKey: ["insights"] });
        },
    });

    const updateTransaction = useMutation({
        mutationFn: ({ id, data }: { id: string; data: any }) => transactionsApi.updateTransaction(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["transactions"] });
            queryClient.invalidateQueries({ queryKey: ["accounts"] });
            queryClient.invalidateQueries({ queryKey: ["dashboard"] });
            queryClient.invalidateQueries({ queryKey: ["budgets"] });
            queryClient.invalidateQueries({ queryKey: ["insights"] });
        },
    });

    const deleteTransaction = useMutation({
        mutationFn: transactionsApi.deleteTransaction,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["transactions"] });
            queryClient.invalidateQueries({ queryKey: ["accounts"] });
            queryClient.invalidateQueries({ queryKey: ["dashboard"] });
            queryClient.invalidateQueries({ queryKey: ["budgets"] });
            queryClient.invalidateQueries({ queryKey: ["insights"] });
        },
    });

    const exportTransactions = useMutation({
        mutationFn: (params: { scope?: string; start_date?: string; end_date?: string }) =>
            transactionsApi.exportTransactions(params),
    });

    return {
        transactions: data || [],
        isLoading,
        error,
        createTransaction,
        updateTransaction,
        deleteTransaction,
        exportTransactions,
    };
}
