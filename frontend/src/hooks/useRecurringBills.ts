"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { recurringBillsApi, RecurringBill } from "@/lib/api/recurringBills.api";

export function useRecurringBills() {
    const queryClient = useQueryClient();

    const { data, isLoading, error } = useQuery({
        queryKey: ["recurring-bills"],
        queryFn: () => recurringBillsApi.getBills(),
    });

    const createBill = useMutation({
        mutationFn: (data: Partial<RecurringBill>) => recurringBillsApi.createBill(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["recurring-bills"] });
            queryClient.invalidateQueries({ queryKey: ["insights"] });
        },
    });

    const updateBill = useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<RecurringBill> }) =>
            recurringBillsApi.updateBill(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["recurring-bills"] });
        },
    });

    const deleteBill = useMutation({
        mutationFn: (id: string) => recurringBillsApi.deleteBill(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["recurring-bills"] });
        },
    });

    return {
        bills: data?.bills ?? [],
        totalMonthly: data?.total_monthly ?? 0,
        dueNext7Days: data?.due_next_7_days ?? [],
        overdue: data?.overdue ?? [],
        isLoading,
        error,
        createBill,
        updateBill,
        deleteBill,
    };
}
