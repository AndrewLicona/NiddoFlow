import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import DashboardClient from "./dashboard/components/DashboardClient";
import LandingPage from "./components/LandingPage";

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
            data: { user },
            error: userError
        } = await supabase.auth.getUser();

        if (userError || !user) {
            return <LandingPage />;
        }

        const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .single();

        // If no profile found or database error, send to onboarding
        if (profileError || !profile?.family_id) {
            // We use a flag or throwing a specific error to handle redirect outside the try/catch if needed,
            // or we just let it bubble if we import isRedirectError (not available in all Next.js versions easily).
            // Safest pattern: use redirect() here and verify it bubbles.
            // Next.js redirect() throws an error. If we catch it, we break it.
            // We must rethrow if it is a redirect-like error (digest property usually).
            redirect("/onboarding");
        }

        return <DashboardClient user={user} profile={profile} />;
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
