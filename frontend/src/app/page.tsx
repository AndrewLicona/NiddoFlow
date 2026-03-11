import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import DashboardClient from "./dashboard/components/DashboardClient";
import LandingPage from "./components/LandingPage";
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { dashboardApi } from "@/lib/api/dashboard.api";
import { accountsApi } from "@/lib/api/accounts.api";
import { transactionsApi } from "@/lib/api/transactions.api";
import { budgetsApi } from "@/lib/api/budgets.api";
import { debtsApi } from "@/lib/api/debts.api";
import { Suspense } from "react";
import { DashboardSkeleton } from "@/components/ui/molecules/SkeletonLoaders";

export default async function DashboardPage(props: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const searchParams = await props.searchParams;
    const code = searchParams.code as string;

    if (code) {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "";
        redirect(`${baseUrl}/auth/callback?code=${code}`);
    }

    try {
        const supabase = await createClient();

        const {
            data: { session },
            error: sessionError
        } = await supabase.auth.getSession();

        if (sessionError || !session?.user) {
            return <LandingPage />;
        }

        // Use getUser() for better security as per Supabase recommendations
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user) {
            return <LandingPage />;
        }

        const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .single();

        if (profileError || !profile?.family_id) {
            redirect("/onboarding");
        }

        const queryClient = new QueryClient();
        const authHeader = { Authorization: `Bearer ${session.access_token}` };

        // Prefetch all necessary data on the server
        await Promise.all([
            queryClient.prefetchQuery({
                queryKey: ["dashboard"],
                queryFn: () => dashboardApi.getStats(authHeader),
            }),
            queryClient.prefetchQuery({
                queryKey: ["accounts", "family"],
                queryFn: () => accountsApi.getAccounts("family", authHeader),
            }),
            queryClient.prefetchQuery({
                queryKey: ["transactions", { limit: 5 }],
                queryFn: () => transactionsApi.getTransactions({ limit: 5 }, authHeader),
            }),
            queryClient.prefetchQuery({
                queryKey: ["budgets", "family"],
                queryFn: () => budgetsApi.getBudgets("family", authHeader),
            }),
            queryClient.prefetchQuery({
                queryKey: ["debts"],
                queryFn: () => debtsApi.getDebts(authHeader),
            })
        ]);

        return (
            <HydrationBoundary state={dehydrate(queryClient)}>
                <DashboardClient user={user} profile={profile} />
            </HydrationBoundary>
        );
    } catch (error: any) {
        if (error.digest?.startsWith('NEXT_REDIRECT')) {
            throw error;
        }
        console.error("Dashboard Server Error:", error);
        return <LandingPage />;
    }
}
