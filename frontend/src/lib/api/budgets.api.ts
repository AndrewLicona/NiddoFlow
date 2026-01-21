import { fetchWithAuth } from "./client";

export const budgetsApi = {
    getBudgets: async (scope: string = "family") => {
        return fetchWithAuth(`/budgets?scope=${scope}`);
    },
    createBudget: async (data: any) => {
        return fetchWithAuth("/budgets", {
            method: "POST",
            body: JSON.stringify(data),
        });
    },
    deleteBudget: async (id: string) => {
        return fetchWithAuth(`/budgets/${id}`, {
            method: "DELETE",
        });
    },
};
