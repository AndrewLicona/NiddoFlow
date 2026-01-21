import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import TransactionList from "./TransactionList";
import { PageHeader } from "@/components/ui/molecules/PageHeader";
import { Button } from "@/components/ui/atoms/Button";
import { Plus } from "lucide-react";
import Link from "next/link";

export default async function TransactionsPage() {
    const supabase = await createClient();
    const {
        data: { session },
    } = await supabase.auth.getSession();

    if (!session) redirect("/login");

    return (
        <main className="max-w-4xl mx-auto p-4 md:p-8 pb-32">
            <PageHeader
                title="Historial"
                description="Todas tus transacciones y movimientos."
                backHref="/"
                actions={
                    <Link href="/transactions/new">
                        <Button size="sm">
                            <Plus size={16} className="mr-2" />
                            Nueva Transacción
                        </Button>
                    </Link>
                }
            />

            <TransactionList />
        </main>
    );
}
