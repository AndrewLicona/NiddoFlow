import { fetchWithAuth } from "./client";

/**
 * Contrato de `/goals` (CONTRATOS_IMPLEMENTACION.md §7.2).
 *
 * ```
 * GET    /goals/
 * POST   /goals/                { name, target_amount, target_date, category_id }
 * PATCH  /goals/{id}            { name, target_amount, saved_amount, target_date }
 * DELETE /goals/{id}
 * POST   /goals/{id}/contribute { amount, account_id }  -> suma a saved_amount
 * ```
 */
export interface SavingsGoal {
    id: string;
    family_id?: string | null;
    name: string;
    target_amount: number;
    saved_amount: number;
    target_date: string | null;
    category_id: string | null;
    category?: string | null;
    created_by?: string | null;
    created_at?: string | null;
}

export interface GoalPayload {
    name: string;
    target_amount: number;
    target_date?: string | null;
    category_id?: string | null;
}

export interface GoalUpdatePayload {
    name?: string;
    target_amount?: number;
    saved_amount?: number;
    target_date?: string | null;
}

export interface GoalContributionPayload {
    amount: number;
    account_id?: string | null;
}

/** El backend puede responder una lista o un objeto con `goals`. */
type GoalsResponse = SavingsGoal[] | { goals?: SavingsGoal[] } | null;

export const goalsApi = {
    getGoals: async (headers?: Record<string, string>): Promise<SavingsGoal[]> => {
        const data = (await fetchWithAuth("/goals/", { headers })) as GoalsResponse;
        if (Array.isArray(data)) return data;
        return data?.goals ?? [];
    },

    createGoal: async (data: GoalPayload, headers?: Record<string, string>): Promise<SavingsGoal> => {
        return fetchWithAuth("/goals/", {
            method: "POST",
            body: JSON.stringify(data),
            headers,
        }) as Promise<SavingsGoal>;
    },

    updateGoal: async (
        id: string,
        data: GoalUpdatePayload,
        headers?: Record<string, string>
    ): Promise<SavingsGoal> => {
        return fetchWithAuth(`/goals/${id}`, {
            method: "PATCH",
            body: JSON.stringify(data),
            headers,
        }) as Promise<SavingsGoal>;
    },

    deleteGoal: async (id: string, headers?: Record<string, string>): Promise<unknown> => {
        return fetchWithAuth(`/goals/${id}`, { method: "DELETE", headers });
    },

    /** Suma un aporte a lo ahorrado de la meta. */
    contribute: async (
        id: string,
        data: GoalContributionPayload,
        headers?: Record<string, string>
    ): Promise<SavingsGoal> => {
        return fetchWithAuth(`/goals/${id}/contribute`, {
            method: "POST",
            body: JSON.stringify(data),
            headers,
        }) as Promise<SavingsGoal>;
    },
};
