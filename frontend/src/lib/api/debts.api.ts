import { fetchWithAuth } from "./client";

export const debtsApi = {
    getDebts: async () => {
        return fetchWithAuth("/debts");
    },
    createDebt: async (data: any) => {
        return fetchWithAuth("/debts", {
            method: "POST",
            body: JSON.stringify(data),
        });
    },
    updateDebt: async (id: string, data: any) => {
        return fetchWithAuth(`/debts/${id}`, {
            method: "PATCH",
            body: JSON.stringify(data),
        });
    },
    deleteDebt: async (id: string) => {
        return fetchWithAuth(`/debts/${id}`, {
            method: "DELETE",
        });
    },
    payDebt: async (id: string, paymentData: any) => {
        return fetchWithAuth(`/debts/${id}/pay`, {
            method: "POST",
            body: JSON.stringify(paymentData),
        });
    },
};
