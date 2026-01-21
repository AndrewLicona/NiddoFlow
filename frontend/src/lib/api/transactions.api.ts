import { fetchWithAuth } from "./client";

export const transactionsApi = {
    getTransactions: async (params: { scope?: string; start_date?: string; end_date?: string; limit?: number } = {}) => {
        const query = new URLSearchParams();
        if (params.scope) query.append("scope", params.scope);
        if (params.start_date) query.append("start_date", params.start_date);
        if (params.end_date) query.append("end_date", params.end_date);
        if (params.limit) query.append("limit", params.limit.toString());

        return fetchWithAuth(`/transactions?${query.toString()}`);
    },
    createTransaction: async (data: any) => {
        return fetchWithAuth("/transactions", {
            method: "POST",
            body: JSON.stringify(data),
        });
    },
    updateTransaction: async (id: string, data: any) => {
        return fetchWithAuth(`/transactions/${id}`, {
            method: "PATCH",
            body: JSON.stringify(data),
        });
    },
    deleteTransaction: async (id: string) => {
        return fetchWithAuth(`/transactions/${id}`, {
            method: "DELETE",
        });
    },
};
