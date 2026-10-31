import { fetchWithAuth } from "./client";

export interface RecurringBill {
    id: string;
    family_id: string;
    name: string;
    amount: number;
    cadence: "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";
    day_of_month: number | null;
    next_due_date: string | null;
    category_id: string | null;
    category_name: string | null;
    is_active: boolean;
    notes: string | null;
    days_until_due: number | null;
    monthly_equivalent: number;
    is_overdue: boolean;
}

export interface RecurringBillsSummary {
    bills: RecurringBill[];
    total_monthly: number;
    due_next_7_days: RecurringBill[];
    overdue: RecurringBill[];
}

export const recurringBillsApi = {
    getBills: async (): Promise<RecurringBillsSummary> => {
        return fetchWithAuth("/recurring-bills/");
    },
    createBill: async (data: Partial<RecurringBill>): Promise<RecurringBill> => {
        return fetchWithAuth("/recurring-bills/", {
            method: "POST",
            body: JSON.stringify(data),
        });
    },
    updateBill: async (id: string, data: Partial<RecurringBill>): Promise<RecurringBill> => {
        return fetchWithAuth(`/recurring-bills/${id}`, {
            method: "PATCH",
            body: JSON.stringify(data),
        });
    },
    deleteBill: async (id: string) => {
        return fetchWithAuth(`/recurring-bills/${id}`, { method: "DELETE" });
    },
};
