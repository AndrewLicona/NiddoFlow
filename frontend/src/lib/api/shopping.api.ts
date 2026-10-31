import { fetchWithAuth } from "./client";

export type ShoppingPriority = "low" | "normal" | "high";
export type ShoppingStatus = "pending" | "purchased" | "skipped";

export interface ShoppingItem {
    id: string;
    name: string;
    category_id: string | null;
    category?: string | null;
    quantity: number;
    estimated_price: number | null;
    priority: ShoppingPriority;
    status: ShoppingStatus;
    notes?: string | null;
    purchase_transaction_id?: string | null;
    purchased_at?: string | null;
    created_at?: string | null;
}

export interface ShoppingItemPayload {
    name: string;
    category_id?: string | null;
    quantity?: number;
    estimated_price?: number | null;
    priority?: ShoppingPriority;
    notes?: string | null;
}

export interface ShoppingPurchasePayload {
    account_id: string;
    amount?: number;
    date?: string;
}

export const shoppingApi = {
    getShoppingItems: async (
        scope: string = "family",
        status?: ShoppingStatus,
        headers?: Record<string, string>
    ): Promise<ShoppingItem[]> => {
        const params = new URLSearchParams({ scope });
        if (status) params.append("status", status);

        return fetchWithAuth(`/shopping/?${params.toString()}`, { headers }) as Promise<ShoppingItem[]>;
    },

    createShoppingItem: async (
        data: ShoppingItemPayload,
        headers?: Record<string, string>
    ): Promise<ShoppingItem> => {
        return fetchWithAuth("/shopping/", {
            method: "POST",
            body: JSON.stringify(data),
            headers,
        }) as Promise<ShoppingItem>;
    },

    updateShoppingItem: async (
        id: string,
        data: Partial<ShoppingItemPayload> & { status?: ShoppingStatus },
        headers?: Record<string, string>
    ): Promise<ShoppingItem> => {
        return fetchWithAuth(`/shopping/${id}`, {
            method: "PATCH",
            body: JSON.stringify(data),
            headers,
        }) as Promise<ShoppingItem>;
    },

    deleteShoppingItem: async (id: string, headers?: Record<string, string>): Promise<unknown> => {
        return fetchWithAuth(`/shopping/${id}`, {
            method: "DELETE",
            headers,
        });
    },

    /** Marca la necesidad como comprada y genera el movimiento en la cuenta indicada. */
    purchaseShoppingItem: async (
        id: string,
        data: ShoppingPurchasePayload,
        headers?: Record<string, string>
    ): Promise<ShoppingItem> => {
        return fetchWithAuth(`/shopping/${id}/purchase`, {
            method: "POST",
            body: JSON.stringify(data),
            headers,
        }) as Promise<ShoppingItem>;
    },
};
