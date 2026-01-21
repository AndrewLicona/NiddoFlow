import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import AccountsClient from "./AccountsClient";

export default async function AccountsPage() {
    const supabase = await createClient();
    const {
        data: { session },
    } = await supabase.auth.getSession();

    if (!session) redirect("/login");

    return <AccountsClient />;
}
