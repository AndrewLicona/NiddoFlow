import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    shoppingApi,
    type ShoppingItemPayload,
    type ShoppingPurchasePayload,
    type ShoppingStatus,
} from "@/lib/api/shopping.api";

export function useShopping(scope: string = "family", status: ShoppingStatus = "pending") {
    const queryClient = useQueryClient();

    const { data, isLoading, error } = useQuery({
        queryKey: ["shopping", scope, status],
        queryFn: () => shoppingApi.getShoppingItems(scope, status),
    });

    const createItem = useMutation({
        mutationFn: (payload: ShoppingItemPayload) => shoppingApi.createShoppingItem(payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["shopping"] });
        },
    });

    const updateItem = useMutation({
        mutationFn: ({ id, data }: { id: string; data: Parameters<typeof shoppingApi.updateShoppingItem>[1] }) =>
            shoppingApi.updateShoppingItem(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["shopping"] });
        },
    });

    const deleteItem = useMutation({
        mutationFn: (id: string) => shoppingApi.deleteShoppingItem(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["shopping"] });
        },
    });

    const purchaseItem = useMutation({
        mutationFn: ({ id, data }: { id: string; data: ShoppingPurchasePayload }) =>
            shoppingApi.purchaseShoppingItem(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["shopping"] });
            queryClient.invalidateQueries({ queryKey: ["transactions"] });
            queryClient.invalidateQueries({ queryKey: ["accounts"] });
            queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        },
    });

    return {
        items: data || [],
        isLoading,
        error,
        createItem,
        updateItem,
        deleteItem,
        purchaseItem,
    };
}
