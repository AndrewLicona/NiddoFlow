import { fetchWithAuth } from "./client";

export const categoriesApi = {
    getCategories: async () => {
        return fetchWithAuth("/categories");
    },
};
