import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import ShoppingClient from "./ShoppingClient";
import { PageHeader } from "@/components/ui/molecules/PageHeader";

export default async function ShoppingPage() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    return (
        <main className="max-w-4xl mx-auto p-4 md:p-8 space-y-8 pb-32">
            <PageHeader
                title="Lista de necesidades"
                description="Anota lo que la familia quiere comprar y márcalo cuando lo consigas."
                backHref="/"
            />

            <ShoppingClient />
        </main>
    );
}
