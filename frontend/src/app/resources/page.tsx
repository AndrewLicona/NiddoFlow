import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { PageHeader } from "@/components/ui/molecules/PageHeader";
import ShoppingClient from "../shopping/ShoppingClient";
import BillsClient from "../bills/BillsClient";
import { Purchases } from "./Purchases";

export const metadata = { title: "Recursos" };

const sections = [
    { id: "needs", label: "Necesidades" },
    { id: "payments", label: "Pagos recurrentes" },
    { id: "purchases", label: "Productos comprados" },
] as const;

export default async function ResourcesPage({ searchParams }: {
    searchParams: Promise<{ scope?: string; section?: string }>;
}) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const filters = await searchParams;
    const scope = filters.scope === "personal" ? "personal" : "family";
    const section = sections.find(item => item.id === filters.section)?.id ?? "needs";
    const href = (nextScope: string, nextSection: string) =>
        `/resources?scope=${nextScope}&section=${nextSection}`;
    const optionStyle = (active: boolean) =>
        `inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold ${active ? "bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-muted"}`;

    return (
        <main className="mx-auto max-w-4xl space-y-5 p-4 pb-32 md:p-8">
            <PageHeader title="Recursos" description="Organiza lo que necesitas, lo que pagas y los productos que compraste." backHref="/" />
            <nav aria-label="Vista de recursos" className="flex flex-wrap gap-2">
                <Link href={href("family", section)} aria-current={scope === "family" ? "page" : undefined} className={optionStyle(scope === "family")}>Familiar</Link>
                <Link href={href("personal", section)} aria-current={scope === "personal" ? "page" : undefined} className={optionStyle(scope === "personal")}>Personal</Link>
            </nav>
            {scope === "personal" && <p className="text-sm text-muted-foreground">Muestra los registros que tú agregaste. Los registros compartidos siguen disponibles en Familiar.</p>}
            <nav aria-label="Secciones de recursos" className="flex flex-wrap gap-2 border-y border-foreground/10 py-3">
                {sections.map(item => (
                    <Link key={item.id} href={href(scope, item.id)} aria-current={section === item.id ? "page" : undefined} className={optionStyle(section === item.id)}>
                        {item.label}
                    </Link>
                ))}
            </nav>
            {section === "needs" && <ShoppingClient key={scope} scope={scope} />}
            {section === "payments" && <BillsClient key={scope} creatorId={scope === "personal" ? user.id : undefined} />}
            {section === "purchases" && <Purchases key={scope} creatorId={scope === "personal" ? user.id : undefined} />}
        </main>
    );
}
