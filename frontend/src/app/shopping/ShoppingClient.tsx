'use client';

import React, { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/molecules/Card';
import { Typography } from '@/components/ui/atoms/Typography';
import { Button } from '@/components/ui/atoms/Button';
import { InputField } from '@/components/ui/molecules/InputField';
import { useShopping } from '@/hooks/useShopping';
import { useCategories } from '@/hooks/useCategories';
import { useAccounts } from '@/hooks/useAccounts';
import { formatCurrency } from '@/utils/format';
import type { ShoppingItem, ShoppingPriority } from '@/lib/api/shopping.api';
import {
    ShoppingCart,
    Plus,
    Trash2,
    Check,
    Loader2,
    AlertTriangle,
    ChevronRight,
    Wallet,
} from 'lucide-react';

const PRIORITY_LABELS: Record<ShoppingPriority, string> = {
    low: 'Baja',
    normal: 'Media',
    high: 'Alta',
};

const PRIORITY_STYLES: Record<ShoppingPriority, string> = {
    low: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-300',
    normal: 'bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-500/20 text-blue-700 dark:text-blue-300',
    high: 'bg-rose-50 dark:bg-rose-900/20 border-rose-100 dark:border-rose-500/20 text-rose-700 dark:text-rose-300',
};

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function ShoppingClient() {
    const { items, isLoading, error, createItem, deleteItem, purchaseItem } = useShopping();
    const { categories } = useCategories();
    const { accounts } = useAccounts();

    const [name, setName] = useState('');
    const [categoryInput, setCategoryInput] = useState('');
    const [priority, setPriority] = useState<ShoppingPriority>('normal');
    const [estimatedPrice, setEstimatedPrice] = useState('');
    const [formError, setFormError] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const [purchasing, setPurchasing] = useState<ShoppingItem | null>(null);
    const [purchaseAccount, setPurchaseAccount] = useState('');
    const [purchaseAmount, setPurchaseAmount] = useState('');
    const [purchaseDate, setPurchaseDate] = useState(todayIso());
    const [purchaseError, setPurchaseError] = useState('');

    const expenseCategories = useMemo(
        () => categories.filter((c) => c.type === 'expense'),
        [categories]
    );

    const categoryName = useCallback(
        (id: string | null | undefined) =>
            categories.find((c) => c.id === id)?.name || 'Sin categoría',
        [categories]
    );

    /** Agrupa los pendientes por categoría (las que no tienen, van al final). */
    const grouped = useMemo(() => {
        const groups = new Map<string, ShoppingItem[]>();
        items.forEach((item) => {
            const key = item.category_id || 'sin-categoria';
            const list = groups.get(key) || [];
            list.push(item);
            groups.set(key, list);
        });
        return Array.from(groups.entries()).sort(([keyA], [keyB]) => {
            if (keyA === 'sin-categoria') return 1;
            if (keyB === 'sin-categoria') return -1;
            return categoryName(keyA).localeCompare(categoryName(keyB));
        });
    }, [items, categoryName]);

    const totalEstimated = items.reduce((acc, item) => acc + Number(item.estimated_price || 0), 0);

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) {
            setFormError('Escribe qué necesitas.');
            return;
        }

        // Autocompletado: si el texto de categoría coincide con una categoría existente, la usamos.
        const matched = expenseCategories.find(
            (c) => c.name.toLowerCase() === categoryInput.trim().toLowerCase()
        );

        setFormError('');
        setIsSaving(true);
        try {
            await createItem.mutateAsync({
                name: trimmed,
                category_id: matched?.id || null,
                quantity: 1,
                estimated_price: estimatedPrice ? Number(estimatedPrice.replace(/\./g, '')) : null,
                priority,
            });
            setName('');
            setCategoryInput('');
            setEstimatedPrice('');
            setPriority('normal');
        } catch (err) {
            setFormError(err instanceof Error ? err.message : 'No se pudo añadir la necesidad.');
        } finally {
            setIsSaving(false);
        }
    };

    const openPurchase = (item: ShoppingItem) => {
        setPurchasing(item);
        setPurchaseAccount(accounts?.[0]?.id || '');
        setPurchaseAmount(item.estimated_price ? String(item.estimated_price) : '');
        setPurchaseDate(todayIso());
        setPurchaseError('');
    };

    const handlePurchase = async () => {
        if (!purchasing) return;
        if (!purchaseAccount) {
            setPurchaseError('Elige la cuenta desde la que se registra la compra.');
            return;
        }

        setPurchaseError('');
        try {
            await purchaseItem.mutateAsync({
                id: purchasing.id,
                data: {
                    account_id: purchaseAccount,
                    amount: purchaseAmount ? Number(purchaseAmount.replace(/\./g, '')) : undefined,
                    date: purchaseDate,
                },
            });
            setPurchasing(null);
        } catch (err) {
            setPurchaseError(err instanceof Error ? err.message : 'No se pudo registrar la compra.');
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteItem.mutateAsync(id);
        } catch (err) {
            setFormError(err instanceof Error ? err.message : 'No se pudo eliminar la necesidad.');
        }
    };

    return (
        <div className="space-y-8">
            {/* Añadir rápido */}
            <Card variant="elevated">
                <div className="flex items-center space-x-3 mb-6">
                    <div className="p-2 bg-blue-500/10 rounded-xl">
                        <ShoppingCart size={20} className="text-blue-600" />
                    </div>
                    <div>
                        <Typography variant="h3">¿Qué falta en casa?</Typography>
                        <Typography variant="muted">Añade lo que quieres comprar y organízalo por categoría.</Typography>
                    </div>
                </div>

                <form onSubmit={handleAdd} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="md:col-span-2">
                            <InputField
                                label="Necesidad"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Ej: Café molido"
                                maxLength={80}
                            />
                        </div>
                        <div>
                            <InputField
                                label="Categoría"
                                value={categoryInput}
                                onChange={(e) => setCategoryInput(e.target.value)}
                                placeholder="Alimentación"
                                list="shopping-categories"
                            />
                            <datalist id="shopping-categories">
                                {expenseCategories.map((c) => (
                                    <option key={c.id} value={c.name} />
                                ))}
                            </datalist>
                        </div>
                        <InputField
                            label="Prioridad"
                            as="select"
                            value={priority}
                            onChange={(e) => setPriority(e.target.value as ShoppingPriority)}
                        >
                            <option value="high">Alta</option>
                            <option value="normal">Media</option>
                            <option value="low">Baja</option>
                        </InputField>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="md:col-span-1">
                            <InputField
                                label="Precio estimado"
                                type="text"
                                inputMode="numeric"
                                value={estimatedPrice}
                                onChange={(e) => setEstimatedPrice(e.target.value.replace(/\D/g, ''))}
                                placeholder="0"
                            />
                        </div>
                        <div className="md:col-span-3 flex items-end">
                            <Button type="submit" variant="primary" disabled={isSaving} className="w-full md:w-auto">
                                {isSaving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Plus size={16} className="mr-2" />}
                                Añadir a la lista
                            </Button>
                        </div>
                    </div>

                    {formError && (
                        <Typography variant="muted" className="text-rose-500">{formError}</Typography>
                    )}
                </form>
            </Card>

            {/* Errores de conexión (el backend puede no estar disponible todavía) */}
            {error && (
                <div className="rounded-2xl border border-amber-500/20 bg-amber-50 dark:bg-amber-900/10 p-4 flex items-start gap-3">
                    <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                    <div>
                        <Typography variant="body" className="font-bold text-amber-800 dark:text-amber-200">
                            No se pudo cargar la lista de necesidades
                        </Typography>
                        <Typography variant="muted" className="text-amber-700/80 dark:text-amber-300/70">
                            El servicio de compras no respondió. Inténtalo de nuevo en un momento.
                        </Typography>
                    </div>
                </div>
            )}

            {/* Lista agrupada por categoría */}
            <Card variant="elevated">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                    <div className="flex items-center space-x-3">
                        <div className="p-2 bg-emerald-500/10 rounded-xl">
                            <ShoppingCart size={20} className="text-emerald-600" />
                        </div>
                        <div>
                            <Typography variant="h3">Pendientes</Typography>
                            <Typography variant="muted">
                                {isLoading
                                    ? 'Cargando...'
                                    : `${items.length} ${items.length === 1 ? 'necesidad' : 'necesidades'} · ${formatCurrency(totalEstimated)} estimados`}
                            </Typography>
                        </div>
                    </div>
                </div>

                {items.length === 0 && !isLoading && (
                    <div className="py-10 text-center">
                        <div className="mx-auto h-14 w-14 rounded-2xl bg-foreground/[0.04] flex items-center justify-center text-foreground/20 mb-4">
                            <ShoppingCart size={26} />
                        </div>
                        <Typography variant="body" className="font-bold text-foreground/70">
                            Todavía no hay nada en la lista
                        </Typography>
                        <Typography variant="muted" className="text-foreground/40">
                            Añade arriba lo que la familia quiere comprar.
                        </Typography>
                    </div>
                )}

                <div className="space-y-8">
                    {grouped.map(([groupKey, groupItems]) => (
                        <div key={groupKey} className="space-y-3">
                            <div className="flex items-center gap-2">
                                <Typography variant="small" className="text-muted-foreground">
                                    {categoryName(groupKey === 'sin-categoria' ? null : groupKey)}
                                </Typography>
                                <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10px] font-black text-muted-foreground">
                                    {groupItems.length}
                                </span>
                            </div>

                            <div className="space-y-2">
                                {groupItems.map((item) => (
                                    <div
                                        key={item.id}
                                        className="flex items-center justify-between gap-3 p-3 rounded-2xl border border-foreground/[0.05] bg-foreground/[0.02] hover:border-foreground/10 transition-colors"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <Typography variant="body" className="font-bold text-foreground">
                                                        {item.name}
                                                    </Typography>
                                                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${PRIORITY_STYLES[item.priority] || PRIORITY_STYLES.normal}`}>
                                                        {PRIORITY_LABELS[item.priority] || PRIORITY_LABELS.normal}
                                                    </span>
                                                </div>
                                                <Typography variant="muted" className="text-foreground/50 mt-0.5">
                                                    {Number(item.quantity || 1)} {Number(item.quantity || 1) === 1 ? 'unidad' : 'unidades'}
                                                    {item.estimated_price ? ` · ${formatCurrency(item.estimated_price)}` : ''}
                                                </Typography>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-1 shrink-0">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => openPurchase(item)}
                                                className="text-emerald-600 hover:bg-emerald-500/10"
                                            >
                                                <Check size={16} className="mr-1" />
                                                <span className="hidden sm:inline">Marcar comprado</span>
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleDelete(item.id)}
                                                className="text-rose-500 hover:bg-rose-500/10 p-2"
                                                aria-label={`Eliminar ${item.name}`}
                                            >
                                                <Trash2 size={16} />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </Card>

            {/* Confirmar compra */}
            {purchasing && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setPurchasing(null)} />

                    <Card variant="glass" className="relative w-full max-w-md p-8 rounded-3xl">
                        <div className="flex items-start gap-4 mb-6">
                            <div className="h-12 w-12 shrink-0 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center border border-emerald-500/20">
                                <Check size={22} />
                            </div>
                            <div className="space-y-1">
                                <Typography variant="h3">Marcar como comprado</Typography>
                                <Typography variant="muted" className="text-foreground/60">
                                    Se creará el movimiento en la cuenta que elijas.
                                </Typography>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <InputField
                                label="Cuenta"
                                as="select"
                                value={purchaseAccount}
                                onChange={(e) => setPurchaseAccount(e.target.value)}
                            >
                                <option value="">Selecciona una cuenta</option>
                                {accounts?.map((a: any) => (
                                    <option key={a.id} value={a.id}>{a.name}</option>
                                ))}
                            </InputField>

                            <InputField
                                label="Monto"
                                type="text"
                                inputMode="numeric"
                                value={purchaseAmount}
                                onChange={(e) => setPurchaseAmount(e.target.value.replace(/\D/g, ''))}
                                placeholder="0"
                            />

                            <InputField
                                label="Fecha"
                                type="date"
                                value={purchaseDate}
                                onChange={(e) => setPurchaseDate(e.target.value)}
                            />

                            {(!accounts || accounts.length === 0) && (
                                <Typography variant="muted" className="text-amber-600">
                                    No tienes cuentas configuradas. Crea una para registrar la compra.
                                </Typography>
                            )}

                            {purchaseError && (
                                <Typography variant="muted" className="text-rose-500">{purchaseError}</Typography>
                            )}
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3 mt-8">
                            <Button variant="ghost" className="flex-1" onClick={() => setPurchasing(null)}>
                                Cancelar
                            </Button>
                            <Button
                                variant="primary"
                                className="flex-1"
                                onClick={handlePurchase}
                                disabled={purchaseItem.isPending}
                            >
                                {purchaseItem.isPending
                                    ? <Loader2 size={16} className="mr-2 animate-spin" />
                                    : <Wallet size={16} className="mr-2" />}
                                Registrar compra
                            </Button>
                        </div>

                        <Link href="/accounts/new" className="mt-4 inline-flex items-center text-xs font-bold text-blue-600 hover:text-blue-500">
                            Crear una cuenta <ChevronRight size={12} className="ml-1" />
                        </Link>
                    </Card>
                </div>
            )}
        </div>
    );
}
