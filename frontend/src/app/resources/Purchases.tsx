"use client";

import { useState } from "react";
import Link from "next/link";
import { useTransactions } from "@/hooks/useTransactions";
import { useCategories } from "@/hooks/useCategories";
import { SelectField } from "@/components/ui/molecules/SelectField";
import { formatCurrency } from "@/utils/format";

type Purchase = {
    id: string;
    type: string;
    user_id?: string;
    description: string;
    date: string;
    items?: { id: string; item_name: string; quantity: number; total_price: number; category_id?: string | null; category?: string | null }[];
};

export function Purchases({ creatorId }: { creatorId?: string }) {
    const [search, setSearch] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("");
    const { categories } = useCategories();
    const categoryNames = new Map<string, string>(categories.map((category: { id: string; name: string }) => [category.id, category.name]));
    const { transactions, isLoading, error } = useTransactions();
    const term = search.trim().toLocaleLowerCase("es");
    const products = (transactions as Purchase[]).flatMap(transaction =>
        transaction.type === "expense" && (!creatorId || transaction.user_id === creatorId)
            ? (transaction.items ?? []).map(item => ({
                transaction, item,
                category: categoryNames.get(item.category_id ?? "") ?? (item.category?.trim() || "Sin categoría"),
            }))
            : []
    );
    const options = [...new Set(products.map(product => product.category))].sort((a, b) => a.localeCompare(b, "es"));
    const matches = products.filter(({ item, transaction, category }) =>
        (!categoryFilter || category === categoryFilter) &&
        `${item.item_name} ${transaction.description} ${category}`.toLocaleLowerCase("es").includes(term)
    );

    if (isLoading) return <p role="status">Cargando productos…</p>;
    if (error) return <p role="status">No se pudieron cargar los productos.</p>;
    if (!products.length) return (
        <p>Aún no hay productos registrados en esta vista. Puedes escanear una factura o recuperar sus productos desde el <Link href="/transactions" className="text-primary underline">Historial</Link>.</p>
    );

    return (
        <section className="space-y-4" aria-label="Productos comprados">
            <div className="grid items-end gap-3 rounded-2xl border border-foreground/10 bg-card p-4 sm:grid-cols-[2fr_1fr]">
            <label className="block space-y-1 text-sm font-semibold">
                <span>Buscar por producto o movimiento</span>
                <input type="search" value={search} onChange={event => setSearch(event.target.value)} className="block w-full rounded-xl border border-foreground/15 bg-card p-3 text-base" />
            </label>
            <SelectField aria-label="Filtrar por categoría" value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}>
                <option value="">Todas las categorías</option>
                {options.map(category => <option key={category} value={category}>{category}</option>)}
            </SelectField>
            </div>
            <p role="status" className="text-sm text-muted-foreground">{matches.length} de {products.length} productos</p>
            {!matches.length && <p>No hay productos que coincidan con la búsqueda.</p>}
            <ul className="grid gap-2 sm:grid-cols-2">
                {matches.map(({ item, transaction, category }) => (
                    <li key={item.id} className="rounded-xl border border-foreground/10 bg-card p-4">
                        <div className="flex justify-between gap-3">
                            <strong>{item.item_name}</strong>
                            <span className="shrink-0 font-semibold tabular-nums">{formatCurrency(item.total_price)}</span>
                        </div>
                        <span className="my-2 inline-block rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">{category}</span>
                        <p className="text-sm text-muted-foreground">Cantidad: {item.quantity} · {transaction.date.slice(0, 10)}</p>
                        <Link className="text-sm text-primary underline" href={`/transactions?movement=${encodeURIComponent(transaction.id)}`}>{transaction.description}</Link>
                    </li>
                ))}
            </ul>
        </section>
    );
}
