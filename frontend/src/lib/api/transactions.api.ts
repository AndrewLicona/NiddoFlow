import { fetchWithAuth, fetchWithAuthRaw } from "./client";

export const transactionsApi = {
    getTransactions: async (params: { scope?: string; start_date?: string; end_date?: string; limit?: number } = {}, headers?: Record<string, string>) => {
        const query = new URLSearchParams();
        if (params.scope) query.append("scope", params.scope);
        if (params.start_date) query.append("start_date", params.start_date);
        if (params.end_date) query.append("end_date", params.end_date);
        if (params.limit) query.append("limit", params.limit.toString());

        return fetchWithAuth(`/transactions/?${query.toString()}`, { headers });
    },
    createTransaction: async (data: any) => {
        return fetchWithAuth("/transactions/", {
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
    /**
     * Corrige la categoría de los productos de una factura ya registrada.
     * El OCR propone y el usuario ajusta; el aprendizaje sale de aquí.
     */
    updateItemCategories: async (id: string, items: { item_id: string; category_id: string | null; category?: string | null }[]) => {
        return fetchWithAuth(`/transactions/${id}/items`, {
            method: "PATCH",
            body: JSON.stringify({ items }),
        });
    },
    /**
     * Exporta las transacciones de un rango a PDF. Devuelve la `Response` cruda
     * porque el cuerpo es binario, no JSON.
     */
    exportTransactions: async (params: { scope?: string; start_date?: string; end_date?: string } = {}) => {
        const query = new URLSearchParams();
        if (params.scope) query.append("scope", params.scope);
        if (params.start_date) query.append("start_date", params.start_date);
        if (params.end_date) query.append("end_date", params.end_date);

        return fetchWithAuthRaw(`/transactions/export?${query.toString()}`);
    },
};
