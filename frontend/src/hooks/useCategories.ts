import { useQuery } from "@tanstack/react-query";
import { categoriesApi } from "@/lib/api/categories.api";

export function useCategories() {
    const { data, isLoading, error } = useQuery({
        queryKey: ["categories"],
        queryFn: () => categoriesApi.getCategories(),
    });

    return {
        categories: data || [],
        isLoading,
        error,
    };
}
