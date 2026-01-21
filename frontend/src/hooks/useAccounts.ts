import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { accountsApi } from "@/lib/api/accounts.api";

export function useAccounts(scope: string = "family") {
    const queryClient = useQueryClient();

    const { data, isLoading, error } = useQuery({
        queryKey: ["accounts", scope],
        queryFn: () => accountsApi.getAccounts(scope),
    });

    const createAccount = useMutation({
        mutationFn: accountsApi.createAccount,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["accounts"] });
        },
    });

    return {
        accounts: data || [],
        isLoading,
        error,
        createAccount,
    };
}
