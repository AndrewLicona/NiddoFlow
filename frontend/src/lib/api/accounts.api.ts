import { fetchWithAuth } from "./client";

export const accountsApi = {
    getAccounts: async (scope: string = "family", headers?: Record<string, string>) => {
        return fetchWithAuth(`/accounts/?scope=${scope}`, { headers });
    },
    createAccount: async (data: any) => {
        return fetchWithAuth("/accounts/", {
            method: "POST",
            body: JSON.stringify(data),
        });
    },
};
