import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import BudgetClient from "./BudgetClient";
import { PageHeader } from "@/components/ui/molecules/PageHeader";

export default async function BudgetsPage() {
    const supabase = await createClient();
    const {
        data: { session },
    } = await supabase.auth.getSession();

    if (!session) redirect("/login");

    return (
        <main className="max-w-4xl mx-auto p-4 md:p-8 space-y-8 min-h-screen pb-24">
            <PageHeader
                title="Presupuestos"
                description="Controla tus gastos por categoría (Semanales y Mensuales)."
                backHref="/"
            />

            <BudgetClient userId={session.user.id} />
        </main>
    );
}
