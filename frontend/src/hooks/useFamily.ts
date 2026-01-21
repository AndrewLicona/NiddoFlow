import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { familyApi } from "@/lib/api/family.api";

export function useFamily() {
    const queryClient = useQueryClient();

    const { data: members, isLoading: membersLoading } = useQuery({
        queryKey: ["family", "members"],
        queryFn: familyApi.getMembers,
    });

    const { data: family, isLoading: familyLoading } = useQuery({
        queryKey: ["family", "details"],
        queryFn: familyApi.getMyFamily,
    });

    const createFamily = useMutation({
        mutationFn: familyApi.createFamily,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["family"] });
            queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        },
    });

    const joinFamily = useMutation({
        mutationFn: familyApi.joinFamily,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["family"] });
            queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        },
    });

    return {
        members: members || [],
        family: family || null,
        isLoading: membersLoading || familyLoading,
        createFamily,
        joinFamily,
    };
}
