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
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    return (
        <main className="max-w-4xl mx-auto p-4 md:p-8 pb-32">
            <PageHeader
                title="Historial"
                description="Todas tus transacciones y movimientos."
                backHref="/"
                actions={
                    <div className="flex gap-2">
                        <Link href="/transactions/bulk">
                            <Button size="sm" variant="outline" className="border-blue-500/20 text-blue-600 hover:bg-blue-600 hover:text-white">
                                <Plus size={16} className="mr-2" />
                                Carga Masiva
                            </Button>
                        </Link>
                        <Link href="/transactions/new">
                            <Button size="sm">
                                <Plus size={16} className="mr-2" />
                                Nueva Transacción
                            </Button>
                        </Link>
                    </div>
                }
            />

            <TransactionList />
        </main>
    );
}
