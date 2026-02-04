import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import DashboardClient from "./dashboard/components/DashboardClient";
import LandingPage from "./components/LandingPage";
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { dashboardApi } from "@/lib/api/dashboard.api";
import { accountsApi } from "@/lib/api/accounts.api";
import { transactionsApi } from "@/lib/api/transactions.api";

export default async function DashboardPage(props: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const searchParams = await props.searchParams;
    const code = searchParams.code as string;

    // Emergency redirect if OAuth code lands on root instead of /auth/callback
    if (code) {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "";
        redirect(`${baseUrl}/auth/callback?code=${code}`);
    }

    try {
        const supabase = await createClient();

        // Use getUser() for server-side reliability
        const {
            data: { session },
            error: sessionError
        } = await supabase.auth.getSession();

        if (sessionError || !session?.user) {
            return <LandingPage />;
        }

        const user = session.user;

        const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .single();

        // If no profile found or database error, send to onboarding
        if (profileError || !profile?.family_id) {
            redirect("/onboarding");
        }

        // Prefetch data on the server
        const queryClient = new QueryClient();
        const authHeader = { Authorization: `Bearer ${session.access_token}` };

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
            })
        ]);

        return (
            <HydrationBoundary state={dehydrate(queryClient)}>
                <DashboardClient user={user} profile={profile} />
            </HydrationBoundary>
        );
    } catch (error: any) {
        // NEXT_REDIRECT error handling
        if (error.digest?.startsWith('NEXT_REDIRECT')) {
            throw error;
        }

        console.error("Dashboard Server Error:", error);
        // Fallback to LandingPage on any critical error to avoid "Application Error" white screen
        return <LandingPage />;
    }
}
