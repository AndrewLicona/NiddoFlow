import { fetchWithAuth } from "./client";

export const accountsApi = {
    getAccounts: async (scope: string = "family") => {
        return fetchWithAuth(`/accounts?scope=${scope}`);
    },
    createAccount: async (data: any) => {
        return fetchWithAuth("/accounts", {
            method: "POST",
            body: JSON.stringify(data),
        });
    },
};
