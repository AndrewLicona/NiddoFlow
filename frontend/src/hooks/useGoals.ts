"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    goalsApi,
    type GoalContributionPayload,
    type GoalPayload,
    type GoalUpdatePayload,
} from "@/lib/api/goals.api";

export function useGoals() {
    const queryClient = useQueryClient();

    const { data, isLoading, error, isError } = useQuery({
        queryKey: ["goals"],
        queryFn: () => goalsApi.getGoals(),
    });

    const createGoal = useMutation({
        mutationFn: (payload: GoalPayload) => goalsApi.createGoal(payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["goals"] });
        },
    });

    const updateGoal = useMutation({
        mutationFn: ({ id, data }: { id: string; data: GoalUpdatePayload }) =>
            goalsApi.updateGoal(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["goals"] });
        },
    });

    const deleteGoal = useMutation({
        mutationFn: (id: string) => goalsApi.deleteGoal(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["goals"] });
        },
    });

    const contribute = useMutation({
        mutationFn: ({ id, data }: { id: string; data: GoalContributionPayload }) =>
            goalsApi.contribute(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["goals"] });
        },
    });

    return {
        goals: data ?? [],
        isLoading,
        error,
        isError,
        createGoal,
        updateGoal,
        deleteGoal,
        contribute,
    };
}
