"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { transactionsApi } from "@/lib/api/transactions.api";
import { useCategories } from "@/hooks/useCategories";

interface ItemCategoryCorrection {
    item_id: string;
    category_id: string | null;
    category?: string | null;
}

/**
 * Corrección de la categoría de un producto de una factura ya registrada.
 *
 * Además de guardar la categoría, guarda la **regla aprendida**
 * (comercio + producto → categoría) para que las siguientes facturas de ese
 * mismo comercio se clasifiquen solas. La regla se guarda en segundo plano:
 * si falla, no interrumpe la corrección.
 */
export function useItemCategories(transactionId: string, merchant?: string | null) {
    const queryClient = useQueryClient();
    const { createCategoryRule } = useCategories();

    const mutation = useMutation({
        mutationFn: (corrections: ItemCategoryCorrection[]) =>
            transactionsApi.updateItemCategories(transactionId, corrections),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["transactions"] });
            queryClient.invalidateQueries({ queryKey: ["insights"] });
        },
    });

    const updateItemCategory = (correction: ItemCategoryCorrection, rawKeyword?: string) => {
        mutation.mutate([correction]);

        // Aprendizaje: si la categoría quedó resuelta y hay comercio, se
        // guarda la regla para la próxima vez. `rawKeyword` es el texto del
        // producto tal como salió en la factura (no su id), que es lo que
        // después coincide con el OCR.
        if (correction.category_id && correction.category && merchant && rawKeyword) {
            createCategoryRule.mutate(
                {
                    merchant,
                    raw_keyword: rawKeyword,
                    category: correction.category,
                },
                { onError: () => { /* best-effort: no molestar al usuario */ } }
            );
        }
    };

    return {
        updateItemCategory,
        isSaving: mutation.isPending,
        error: mutation.error,
    };
}
