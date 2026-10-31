import { fetchWithAuth } from "./client";

/** Tipos que devuelve el backend. El sistema solo usa `income` y `expense`. */
export type CategoryType = "income" | "expense" | "transfer";
export type CategoryInputType = "income" | "expense";

export interface Category {
    id: string;
    name: string;
    type: CategoryType;
    /** Nombre de un icono de `lucide-react`. `null` si el backend no lo reconoce. */
    icon?: string | null;
    /** `true` = categoría del sistema (no editable ni borrable). */
    is_default?: boolean;
    /** Familia dueña de la categoría. `null` en las del sistema. */
    family_id?: string | null;
}

export interface CategoryPayload {
    name: string;
    type: CategoryInputType;
    icon?: string | null;
}

/** Conteo de registros afectados por tipo (contrato §1). */
export interface CategoryImpactCounts {
    transactions: number;
    budgets: number;
    items: number;
    debts: number;
}

/** Movimiento que usa la categoría. */
export interface ImpactTransaction {
    id: string;
    description: string;
    amount: number;
    date: string;
    type: CategoryType;
}

/** Presupuesto que usa la categoría. `budgets` no tiene columna `name`. */
export interface ImpactBudget {
    id: string;
    amount: number;
    period: "weekly" | "monthly";
    month: number | null;
    week_number: number | null;
    year: number | null;
    user_id: string | null;
}

/** Producto (línea de factura) que usa la categoría. */
export interface ImpactItem {
    id: string;
    transaction_id: string;
    item_name: string;
    quantity: number;
    total_price: number;
    transaction_description: string | null;
}

/** Deuda que usa la categoría. */
export interface ImpactDebt {
    id: string;
    description: string;
    total_amount: number;
    remaining_amount: number;
    type: string;
    due_date: string | null;
}

/** Bloque `affected`: exactamente la misma forma que devuelve `GET /impact`. */
export interface CategoryAffected {
    transactions: ImpactTransaction[];
    budgets: ImpactBudget[];
    items: ImpactItem[];
    debts: ImpactDebt[];
}

/** Respuesta de `GET /categories/{id}/impact`. */
export interface CategoryImpact {
    category: { id: string; name: string; type: CategoryType };
    counts: CategoryImpactCounts;
    transactions: ImpactTransaction[];
    budgets: ImpactBudget[];
    items: ImpactItem[];
    debts: ImpactDebt[];
}

/** Respuesta de `PATCH /categories/{id}/reassign`. */
export interface CategoryReassignResult {
    moved: CategoryImpactCounts;
}

/** Detalle de lo que se pierde al borrar una categoría (contrato §3.2). */
export interface CategoryWarnings {
    transactions_affected?: number;
    budgets_affected?: number;
    items_affected?: number;
    debts_affected?: number;
    message?: string;
    affected?: CategoryAffected;
}

export interface DeleteCategoryResult {
    deleted?: boolean;
    warnings?: CategoryWarnings;
}

/** Regla aprendida: comercio + producto → categoría. */
export interface CategoryRulePayload {
    merchant: string;
    raw_keyword: string;
    category: string;
}

export interface CategoryRule extends CategoryRulePayload {
    id?: string;
}

export const categoriesApi = {
    getCategories: async (headers?: Record<string, string>): Promise<Category[]> => {
        return fetchWithAuth("/categories/", { headers }) as Promise<Category[]>;
    },

    createCategory: async (data: CategoryPayload, headers?: Record<string, string>): Promise<Category> => {
        return fetchWithAuth("/categories/", {
            method: "POST",
            body: JSON.stringify(data),
            headers,
        }) as Promise<Category>;
    },

    updateCategory: async (
        id: string,
        data: Partial<CategoryPayload>,
        headers?: Record<string, string>
    ): Promise<Category> => {
        return fetchWithAuth(`/categories/${id}`, {
            method: "PATCH",
            body: JSON.stringify(data),
            headers,
        }) as Promise<Category>;
    },

    deleteCategory: async (
        id: string,
        headers?: Record<string, string>
    ): Promise<DeleteCategoryResult> => {
        return fetchWithAuth(`/categories/${id}`, {
            method: "DELETE",
            headers,
        }) as Promise<DeleteCategoryResult>;
    },

    /**
     * Detalle de lo que usa una categoría. No escribe nada: solo informa.
     * Permite mostrar el impacto real y decidir si se reasigna antes de borrar.
     */
    getCategoryImpact: async (
        id: string,
        headers?: Record<string, string>
    ): Promise<CategoryImpact> => {
        return fetchWithAuth(`/categories/${id}/impact`, {
            headers,
        }) as Promise<CategoryImpact>;
    },

    /**
     * Mueve todos los registros de la categoría origen a la destino.
     * El destino debe ser visible para el usuario y de tipo compatible.
     */
    reassignCategory: async (
        id: string,
        targetCategoryId: string,
        headers?: Record<string, string>
    ): Promise<CategoryReassignResult> => {
        return fetchWithAuth(`/categories/${id}/reassign`, {
            method: "PATCH",
            body: JSON.stringify({ target_category_id: targetCategoryId }),
            headers,
        }) as Promise<CategoryReassignResult>;
    },

    /** Reglas aprendidas por el usuario (comercio/producto → categoría). */
    getCategoryRules: async (headers?: Record<string, string>): Promise<CategoryRule[]> => {
        return fetchWithAuth("/categories/rules/", { headers }) as Promise<CategoryRule[]>;
    },

    createCategoryRule: async (
        data: CategoryRulePayload,
        headers?: Record<string, string>
    ): Promise<CategoryRule> => {
        return fetchWithAuth("/categories/rules/", {
            method: "POST",
            body: JSON.stringify(data),
            headers,
        }) as Promise<CategoryRule>;
    },
};
