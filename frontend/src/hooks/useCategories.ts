import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    categoriesApi,
    type CategoryPayload,
    type CategoryRulePayload,
} from "@/lib/api/categories.api";

export function useCategories() {
    const queryClient = useQueryClient();

    const { data, isLoading, error } = useQuery({
        queryKey: ["categories"],
        queryFn: () => categoriesApi.getCategories(),
    });

    const createCategory = useMutation({
        mutationFn: (payload: CategoryPayload) => categoriesApi.createCategory(payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["categories"] });
        },
    });

    const updateCategory = useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<CategoryPayload> }) =>
            categoriesApi.updateCategory(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["categories"] });
        },
    });

    const deleteCategory = useMutation({
        mutationFn: (id: string) => categoriesApi.deleteCategory(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["categories"] });
        },
    });

    /** Aprende una regla (comercio + producto → categoría). Best-effort: no bloquea la UI. */
    const createCategoryRule = useMutation({
        mutationFn: (payload: CategoryRulePayload) => categoriesApi.createCategoryRule(payload),
    });

    return {
        categories: data || [],
        isLoading,
        error,
        createCategory,
        updateCategory,
        deleteCategory,
        createCategoryRule,
    };
}

/**
 * Detalle de lo que usa una categoría (movimientos, presupuestos, productos y
 * deudas). Solo lectura: el backend no escribe nada.
 *
 * Se pide justo antes de borrar, para que el usuario vea el impacto real y
 * pueda reasignar antes de eliminar.
 */
export function useCategoryImpact(categoryId: string | null | undefined) {
    return useQuery({
        queryKey: ["categories", "impact", categoryId ?? null],
        queryFn: () => {
            if (!categoryId) throw new Error("Falta la categoría consultada.");
            return categoriesApi.getCategoryImpact(categoryId);
        },
        enabled: !!categoryId,
    });
}

/**
 * Mueve todos los registros de una categoría a otra. Al terminar invalida el
 * catálogo, el impacto y las listas afectadas (movimientos, presupuestos,
 * deudas y los agregados que dependen de la categoría).
 */
export function useReassignCategory() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, targetCategoryId }: { id: string; targetCategoryId: string }) =>
            categoriesApi.reassignCategory(id, targetCategoryId),
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ["categories"] });
            queryClient.invalidateQueries({ queryKey: ["categories", "impact", variables.id] });
            queryClient.invalidateQueries({ queryKey: ["transactions"] });
            queryClient.invalidateQueries({ queryKey: ["budgets"] });
            queryClient.invalidateQueries({ queryKey: ["debts"] });
            queryClient.invalidateQueries({ queryKey: ["dashboard"] });
            queryClient.invalidateQueries({ queryKey: ["insights"] });
        },
    });
}
