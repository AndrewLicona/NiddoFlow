"use client";

import { useMemo } from "react";
import { AlertTriangle, ChevronDown, Package, Sparkles } from "lucide-react";
import { formatCurrency } from "@/utils/format";
import { selectStyles } from "@/components/ui/molecules/SelectField";
import {
    MONEY_DECIMALS,
    QUANTITY_DECIMALS,
    QUANTITY_STEP,
    normalizeQuantity,
    roundMoney,
} from "@/utils/numbers";

export interface OcrItem {
    item_name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    category?: string | null;
    category_id?: string | null;
    confidence?: number | null;
}

export interface OcrCategory {
    id: string;
    name: string;
    type: string;
}

interface Props {
    items: OcrItem[];
    categories: OcrCategory[];
    onChange: (items: OcrItem[]) => void;
    /**
     * Se dispara cuando el usuario cambia la categoría de un producto.
     * Permite guardar la regla aprendida (comercio + producto → categoría).
     */
    onCategoryCorrected?: (item: OcrItem, categoryId: string) => void;
    /** Umbral bajo el cual se marca el producto como poco confiable. */
    lowConfidenceThreshold?: number;
}

/**
 * Editor de los productos detectados en una factura.
 *
 * Es el componente que hace visible el trabajo del OCR: cada producto de la
 * factura aparece con su categoría, y el usuario puede corregirla en un clic.
 *
 * Layout:
 * - En mobile cada producto es una tarjeta apilada. Una tabla de 4 columnas
 *   en un celular de 360px obliga a hacer scroll horizontal y deja los
 *   inputs del tamaño de una uña.
 * - En escritorio se mantiene la tabla, que aprovecha mejor el ancho.
 */
export default function OcrItemsEditor({
    items,
    categories,
    onChange,
    onCategoryCorrected,
    lowConfidenceThreshold = 0.6,
}: Props) {
    const expenseCategories = useMemo(
        () => categories.filter((c) => c.type === "expense"),
        [categories]
    );
    const incomeCategories = useMemo(
        () => categories.filter((c) => c.type === "income"),
        [categories]
    );

    if (!items || items.length === 0) {
        return null;
    }

    const total = items.reduce((acc, i) => acc + Number(i.total_price || 0), 0);
    const withoutCategory = items.filter((i) => !i.category_id && !i.category).length;

    const updateCategory = (index: number, categoryId: string) => {
        const next = items.map((item, i) => {
            if (i !== index) return item;
            const category = categories.find((c) => c.id === categoryId);
            return {
                ...item,
                category_id: categoryId || null,
                category: category?.name ?? item.category ?? null,
            };
        });
        onChange(next);
        if (categoryId && onCategoryCorrected) {
            onCategoryCorrected(items[index], categoryId);
        }
    };

    /**
     * La cantidad admite hasta 3 decimales (1.234 L, 0.333 kg). Si el
     * usuario escribe mas, se redondea en vez de dejar el campo invalido:
     * un input invalido bloquea el guardado del formulario entero.
     */
    const updateQuantity = (index: number, quantity: number) => {
        const next = items.map((item, i) => {
            if (i !== index) return item;
            const qty = normalizeQuantity(quantity, 1);
            return {
                ...item,
                quantity: qty,
                total_price: roundMoney(qty * Number(item.unit_price || 0)),
            };
        });
        onChange(next);
    };

    const categoryOptions = (
        <>
            <option value="">Sin categoría</option>
            {expenseCategories.length > 0 && (
                <optgroup label="Gastos">
                    {expenseCategories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </optgroup>
            )}
            {incomeCategories.length > 0 && (
                <optgroup label="Ingresos">
                    {incomeCategories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </optgroup>
            )}
        </>
    );

    const isLowConfidence = (item: OcrItem) =>
        item.confidence !== undefined &&
        item.confidence !== null &&
        item.confidence < lowConfidenceThreshold;

    return (
        <div className="rounded-2xl border border-foreground/[0.06] bg-foreground/[0.02] overflow-hidden">
            <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 border-b border-foreground/[0.05]">
                <div className="flex items-center gap-2">
                    <Package size={15} className="text-blue-500" />
                    <span className="text-[11px] font-black uppercase tracking-widest text-foreground/60">
                        Productos detectados ({items.length})
                    </span>
                </div>
                {withoutCategory > 0 && (
                    <span className="rounded-full bg-amber-50 border border-amber-100 px-2.5 py-0.5 text-[10px] font-black text-amber-700 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-500/20">
                        {withoutCategory} sin categoría
                    </span>
                )}
            </div>

            {/* ── Mobile: una tarjeta por producto ───────────────────── */}
            <ul className="md:hidden divide-y divide-foreground/[0.05]">
                {items.map((item, index) => {
                    const lowConfidence = isLowConfidence(item);

                    return (
                        <li key={`${item.item_name}-${index}`} className="p-4 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <span className="font-medium break-words">{item.item_name}</span>
                                        {lowConfidence && (
                                            <span
                                                title={`Confianza baja (${Math.round((item.confidence ?? 0) * 100)}%)`}
                                                className="shrink-0"
                                            >
                                                <AlertTriangle size={12} className="text-amber-500" />
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground mt-0.5">
                                        × {formatCurrency(item.unit_price)} c/u
                                        {item.category && !item.category_id && (
                                            <span> · Detectada: {item.category}</span>
                                        )}
                                    </div>
                                </div>
                                <div className="shrink-0 text-right font-black whitespace-nowrap">
                                    {formatCurrency(item.total_price)}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <label className="block">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                        Cantidad
                                    </span>
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        min="0.001"
                                        step={QUANTITY_STEP}
                                        value={item.quantity}
                                        onChange={(e) => updateQuantity(index, parseFloat(e.target.value))}
                                        className="mt-1 w-full rounded-xl border border-foreground/10 bg-background px-3 py-2.5 text-base sm:text-sm text-center"
                                        aria-label={`Cantidad de ${item.item_name}`}
                                    />
                                </label>
                                <div className="block">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                        Total
                                    </span>
                                    <div className="mt-1 rounded-xl border border-foreground/10 bg-background px-3 py-2.5 text-base sm:text-sm font-black text-center">
                                        {formatCurrency(item.total_price)}
                                    </div>
                                </div>
                            </div>

                            <label className="block">
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                    Categoría
                                </span>
                                <div className="relative mt-1">
                                    <select
                                        value={item.category_id || ""}
                                        onChange={(e) => updateCategory(index, e.target.value)}
                                        className={`${selectStyles} w-full py-2.5 text-base sm:text-sm`}
                                        aria-label={`Categoría de ${item.item_name}`}
                                    >
                                        {categoryOptions}
                                    </select>
                                    <ChevronDown
                                        size={16}
                                        aria-hidden="true"
                                        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                                    />                                </div>
                            </label>
                        </li>
                    );
                })}
            </ul>

            {/* ── Escritorio: tabla ──────────────────────────────────── */}
            <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-foreground/[0.05] text-left">
                            <th className="p-3 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Producto</th>
                            <th className="p-3 w-24 text-[10px] font-black uppercase tracking-wider text-muted-foreground text-center">Cant.</th>
                            <th className="p-3 w-28 text-[10px] font-black uppercase tracking-wider text-muted-foreground text-right">Total</th>
                            <th className="p-3 w-48 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Categoría</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item, index) => {
                            const lowConfidence = isLowConfidence(item);

                            return (
                                <tr key={`${item.item_name}-${index}`} className="border-b border-foreground/[0.04] last:border-0">
                                    <td className="p-3">
                                        <div className="flex items-center gap-1.5">
                                            <span className="font-medium">{item.item_name}</span>
                                            {lowConfidence && (
                                                <span title={`Confianza baja (${Math.round((item.confidence ?? 0) * 100)}%)`}>
                                                    <AlertTriangle size={12} className="text-amber-500" />
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground mt-0.5">
                                            × {formatCurrency(item.unit_price)} c/u
                                            {item.category && !item.category_id && (
                                                <span> · Detectada: {item.category}</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-3">
                                        <input
                                            type="number"
                                            inputMode="decimal"
                                            min="0.001"
                                            step={QUANTITY_STEP}
                                            value={item.quantity}
                                            onChange={(e) => updateQuantity(index, parseFloat(e.target.value))}
                                            className="w-full rounded-lg border border-foreground/10 bg-background px-2 py-1.5 text-sm text-center"
                                            aria-label={`Cantidad de ${item.item_name}`}
                                        />
                                    </td>
                                    <td className="p-3 text-right whitespace-nowrap font-bold">
                                        {formatCurrency(item.total_price)}
                                    </td>
                                    <td className="p-3">
                                        <div className="relative">
                                            <select
                                                value={item.category_id || ""}
                                                onChange={(e) => updateCategory(index, e.target.value)}
                                                className={`${selectStyles} w-full py-1.5 pl-3 pr-9 text-sm`}
                                                aria-label={`Categoría de ${item.item_name}`}
                                            >
                                                {categoryOptions}
                                            </select>
                                            <ChevronDown
                                                size={16}
                                                aria-hidden="true"
                                                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                                            />
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="px-4 py-3 flex items-center justify-between gap-3 border-t border-foreground/[0.05]">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Sparkles size={11} className="text-blue-500" />
                    <span className="hidden sm:inline">La IA propone; tú confirmas.</span>
                    <span className="sm:hidden">Tú confirmas.</span>
                </div>
                <div className="text-sm font-black whitespace-nowrap">{formatCurrency(total)}</div>
            </div>

            <p className="px-4 pb-3 text-[10px] text-muted-foreground/80">
                Cantidades con hasta {QUANTITY_DECIMALS} decimales · importes con {MONEY_DECIMALS}
            </p>
        </div>
    );
}
