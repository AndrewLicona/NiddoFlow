import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import TransactionList from "./TransactionList";
import { PageHeader } from "@/components/ui/molecules/PageHeader";
import { Button } from "@/components/ui/atoms/Button";
import { Plus } from "lucide-react";
import Link from "next/link";

export default async function TransactionsPage({ searchParams }: {
    searchParams: Promise<{ scope?: string; month?: string; account?: string | string[]; movement?: string }>;
}) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");
    const filters = await searchParams;
    const scope = filters.scope === "personal" ? "personal" : undefined;
    const movementId = typeof filters.movement === "string" ? filters.movement : undefined;
    const month = typeof filters.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(filters.month) ? filters.month : undefined;
    const accounts = Array.isArray(filters.account) ? filters.account : filters.account ? [filters.account] : [];

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

            {(scope || month || movementId || accounts.length > 0) && (
                <p className="mb-4 text-sm text-muted-foreground">
                    Historial filtrado{month ? ` · ${month}` : ""} ·{" "}
                    <Link href="/transactions" className="font-semibold text-primary underline">Ver todos los movimientos</Link>
                </p>
            )}
            <TransactionList key={movementId} scope={scope} month={month} accountIds={accounts} userId={user.id} movementId={movementId} />
        </main>
    );
}
