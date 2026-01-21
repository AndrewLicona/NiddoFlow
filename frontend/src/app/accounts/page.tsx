import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import AccountsClient from "./AccountsClient";

export default async function AccountsPage() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    return <AccountsClient />;
}
