import { createClient } from "@/utils/supabase/client";

export interface ImportRow {
    row_number: number;
    date: string | null;
    description: string | null;
    merchant: string | null;
    amount: number | null;
    type: "income" | "expense" | "transfer";
    category_id: string | null;
    category_name: string | null;
    account_id: string | null;
    import_hash: string | null;
    status: "new" | "duplicate" | "conflict" | "invalid";
    duplicate_of: string | null;
    duplicate_reason: string | null;
    selected: boolean;
    warnings: string[];
}

export interface ImportPreview {
    rows: ImportRow[];
    total: number;
    new_count: number;
    duplicate_count: number;
    conflict_count: number;
    invalid_count: number;
    detected_format: string;
    accounts: { id: string; name: string; type: string }[];
    categories: { id: string; name: string; type: string; icon?: string | null }[];
    errors: string[];
}

export interface ImportCommitResult {
    created: number;
    skipped: number;
    transaction_ids: string[];
    errors: string[];
    missing_in_bank: { id: string; date: string; description: string; amount: number; note: string }[];
}

async function authHeaders(): Promise<Record<string, string>> {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session ? { Authorization: `Bearer ${session.access_token}` } : {};
}

const baseUrl = () => process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const importApi = {
    /** Analiza el archivo. NO escribe nada en la base de datos. */
    preview: async (file: File): Promise<ImportPreview> => {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch(`${baseUrl()}/import/preview`, {
            method: "POST",
            headers: await authHeaders(),
            body: formData,
        });

        if (!res.ok) {
            const error = await res.json().catch(() => ({ detail: "Error al analizar el archivo" }));
            throw new Error(error.detail || res.statusText);
        }
        return res.json();
    },

    /** Crea únicamente las filas confirmadas. Nunca borra nada existente. */
    commit: async (rows: ImportRow[], defaultAccountId?: string, defaultCategoryId?: string): Promise<ImportCommitResult> => {
        const res = await fetch(`${baseUrl()}/import/commit`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(await authHeaders()),
            },
            body: JSON.stringify({
                rows,
                default_account_id: defaultAccountId || null,
                default_category_id: defaultCategoryId || null,
            }),
        });

        if (!res.ok) {
            const error = await res.json().catch(() => ({ detail: "Error al importar" }));
            throw new Error(error.detail || res.statusText);
        }
        return res.json();
    },
};
