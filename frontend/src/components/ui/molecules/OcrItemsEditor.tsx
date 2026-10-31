"use client";

import { useMemo } from "react";
import { AlertTriangle, Package, Sparkles } from "lucide-react";
import { formatCurrency } from "@/utils/format";

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

    const updateQuantity = (index: number, quantity: number) => {
        const next = items.map((item, i) => {
            if (i !== index) return item;
            const qty = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
            return {
                ...item,
                quantity: qty,
                total_price: Number((qty * Number(item.unit_price || 0)).toFixed(2)),
            };
        });
        onChange(next);
    };

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

            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-foreground/[0.05] text-left">
                            <th className="p-3 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Producto</th>
                            <th className="p-3 w-20 text-[10px] font-black uppercase tracking-wider text-muted-foreground text-center">Cant.</th>
                            <th className="p-3 w-28 text-[10px] font-black uppercase tracking-wider text-muted-foreground text-right">Total</th>
                            <th className="p-3 w-48 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Categoría</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item, index) => {
                            const lowConfidence =
                                item.confidence !== undefined &&
                                item.confidence !== null &&
                                item.confidence < lowConfidenceThreshold;

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
                                        {item.category && !item.category_id && (
                                            <div className="text-[10px] text-muted-foreground mt-0.5">
                                                Detectada: {item.category}
                                            </div>
                                        )}
                                    </td>
                                    <td className="p-3">
                                        <input
                                            type="number"
                                            min="0.01"
                                            step="0.01"
                                            value={item.quantity}
                                            onChange={(e) => updateQuantity(index, parseFloat(e.target.value))}
                                            className="w-full rounded-lg border border-foreground/10 bg-background px-2 py-1 text-xs text-center"
                                            aria-label={`Cantidad de ${item.item_name}`}
                                        />
                                    </td>
                                    <td className="p-3 text-right whitespace-nowrap font-bold">
                                        {formatCurrency(item.total_price)}
                                    </td>
                                    <td className="p-3">
                                        <select
                                            value={item.category_id || ""}
                                            onChange={(e) => updateCategory(index, e.target.value)}
                                            className="w-full rounded-lg border border-foreground/10 bg-background px-2 py-1 text-xs"
                                            aria-label={`Categoría de ${item.item_name}`}
                                        >
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
                                        </select>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="px-4 py-3 flex items-center justify-between border-t border-foreground/[0.05]">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Sparkles size={11} className="text-blue-500" />
                    <span>La IA propone; tú confirmas.</span>
                </div>
                <div className="text-sm font-black">{formatCurrency(total)}</div>
            </div>
        </div>
    );
}
