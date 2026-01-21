import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import DebtClient from "./DebtClient";
import { PageHeader } from "@/components/ui/molecules/PageHeader";

export default async function DebtsPage() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    return (
        <main className="max-w-4xl mx-auto p-4 md:p-8">
            <PageHeader
                title="Deudas y Préstamos"
                description="Gestiona tus compromisos financieros y cuentas por cobrar."
                backHref="/"
            />

            <DebtClient />
        </main>
    );
}
