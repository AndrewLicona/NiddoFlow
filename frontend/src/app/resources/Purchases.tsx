"use client";

import { useState } from "react";
import Link from "next/link";
import { useTransactions } from "@/hooks/useTransactions";
import { formatCurrency } from "@/utils/format";

type Purchase = {
    id: string;
    type: string;
    user_id?: string;
    description: string;
    date: string;
    items?: { id: string; item_name: string; quantity: number; total_price: number }[];
};

export function Purchases({ creatorId }: { creatorId?: string }) {
    const [search, setSearch] = useState("");
    const { transactions, isLoading, error } = useTransactions();
    const term = search.trim().toLocaleLowerCase("es");
    const products = (transactions as Purchase[]).flatMap(transaction =>
        transaction.type === "expense" && (!creatorId || transaction.user_id === creatorId)
            ? (transaction.items ?? []).map(item => ({ transaction, item }))
            : []
    );
    const matches = products.filter(({ item, transaction }) =>
        `${item.item_name} ${transaction.description}`.toLocaleLowerCase("es").includes(term)
    );

    if (isLoading) return <p role="status">Cargando productos…</p>;
    if (error) return <p role="status">No se pudieron cargar los productos.</p>;
    if (!products.length) return (
        <p>Aún no hay productos registrados en esta vista. Puedes escanear una factura o recuperar sus productos desde el <Link href="/transactions" className="text-primary underline">Historial</Link>.</p>
    );

    return (
        <section className="space-y-4" aria-label="Productos comprados">
            <label className="block space-y-1 text-sm font-semibold">
                <span>Buscar por producto o movimiento</span>
                <input type="search" value={search} onChange={event => setSearch(event.target.value)} className="block w-full rounded-xl border border-foreground/15 bg-card p-3 text-base" />
            </label>
            {!matches.length && <p>No hay productos que coincidan con la búsqueda.</p>}
            <ul className="grid gap-2 sm:grid-cols-2">
                {matches.map(({ item, transaction }) => (
                    <li key={item.id} className="rounded-xl border border-foreground/10 bg-card p-4">
                        <div className="flex justify-between gap-3">
                            <strong>{item.item_name}</strong>
                            <span>{formatCurrency(item.total_price)}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">Cantidad: {item.quantity} · {transaction.date.slice(0, 10)}</p>
                        <Link className="text-sm text-primary underline" href={`/transactions?movement=${encodeURIComponent(transaction.id)}`}>{transaction.description}</Link>
                    </li>
                ))}
            </ul>
        </section>
    );
}
