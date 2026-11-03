"use client";

import { useState } from "react";
import {
    CalendarClock,
    Plus,
    Trash2,
    AlertTriangle,
    CheckCircle2,
    Home,
    Loader2,
    X,
} from "lucide-react";
import { useRecurringBills } from "@/hooks/useRecurringBills";
import { useCategories } from "@/hooks/useCategories";
import { RecurringBill } from "@/lib/api/recurringBills.api";
import { formatCurrency } from "@/utils/format";
import { Button } from "@/components/ui/atoms/Button";
import { Card } from "@/components/ui/molecules/Card";
import { Typography } from "@/components/ui/atoms/Typography";
import { SelectField } from "@/components/ui/molecules/SelectField";

const CADENCE_LABELS: Record<string, string> = {
    weekly: "Semanal",
    biweekly: "Quincenal",
    monthly: "Mensual",
    quarterly: "Trimestral",
    yearly: "Anual",
};

export default function BillsClient() {
    const { bills, totalMonthly, dueNext7Days, overdue, isLoading, createBill, deleteBill } = useRecurringBills();
    const { categories } = useCategories();
    const [showForm, setShowForm] = useState(false);

    const [name, setName] = useState("");
    const [amount, setAmount] = useState("");
    const [cadence, setCadence] = useState("monthly");
    const [dayOfMonth, setDayOfMonth] = useState("1");
    const [categoryId, setCategoryId] = useState("");

    const expenseCategories = categories.filter((c: any) => c.type === "expense");

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || !amount) return;

        await createBill.mutateAsync({
            name: name.trim(),
            amount: Number(amount),
            cadence: cadence as RecurringBill["cadence"],
            day_of_month: Number(dayOfMonth) || 1,
            category_id: categoryId || null,
        });

        setName("");
        setAmount("");
        setCategoryId("");
        setShowForm(false);
    };

    const daysLabel = (bill: RecurringBill) => {
        if (bill.days_until_due === null || bill.days_until_due === undefined) return "";
        if (bill.days_until_due < 0) return `Vencido hace ${Math.abs(bill.days_until_due)} días`;
        if (bill.days_until_due === 0) return "Vence hoy";
        if (bill.days_until_due === 1) return "Vence mañana";
        return `Vence en ${bill.days_until_due} días`;
    };

    return (
        <div className="space-y-6">
            {/* Resumen */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="p-5">
                    <div className="flex items-center gap-2 mb-1">
                        <Home size={15} className="text-blue-500" />
                        <Typography variant="small" className="font-black uppercase tracking-widest text-[10px] opacity-50">
                            Costo mensual del hogar
                        </Typography>
                    </div>
                    <Typography variant="h2" className="font-black">{formatCurrency(totalMonthly)}</Typography>
                    <Typography variant="small" className="text-muted-foreground mt-1">
                        Suma de todos los compromisos activos, normalizados a mes.
                    </Typography>
                </Card>

                <Card className="p-5">
                    <div className="flex items-center gap-2 mb-1">
                        <CalendarClock size={15} className="text-amber-500" />
                        <Typography variant="small" className="font-black uppercase tracking-widest text-[10px] opacity-50">
                            Próximos 7 días
                        </Typography>
                    </div>
                    <Typography variant="h2" className="font-black">{dueNext7Days.length}</Typography>
                    <Typography variant="small" className="text-muted-foreground mt-1">
                        {dueNext7Days.length
                            ? dueNext7Days.map((b) => b.name).join(", ")
                            : "Nada vence esta semana."}
                    </Typography>
                </Card>

                <Card className="p-5">
                    <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle size={15} className="text-rose-500" />
                        <Typography variant="small" className="font-black uppercase tracking-widest text-[10px] opacity-50">
                            Vencidos
                        </Typography>
                    </div>
                    <Typography variant="h2" className="font-black">{overdue.length}</Typography>
                    <Typography variant="small" className="text-muted-foreground mt-1">
                        {overdue.length ? "Revísalos para actualizar la fecha." : "Todo al día."}
                    </Typography>
                </Card>
            </div>

            {/* Formulario */}
            {showForm ? (
                <Card className="p-5">
                    <form onSubmit={handleCreate} className="space-y-4">
                        <div className="flex items-center justify-between">
                            <Typography variant="h3" className="font-black">Nuevo compromiso del hogar</Typography>
                            <button type="button" onClick={() => setShowForm(false)} className="opacity-50 hover:opacity-100 cursor-pointer">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <label className="block">
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nombre</span>
                                <input
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Arriendo, luz, seguro..."
                                    required
                                    className="mt-1 w-full rounded-xl border border-foreground/10 bg-background px-3 py-2 text-sm"
                                />
                            </label>
                            <label className="block">
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Valor</span>
                                <input
                                    type="number"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    required
                                    min="0"
                                    className="mt-1 w-full rounded-xl border border-foreground/10 bg-background px-3 py-2 text-sm"
                                />
                            </label>
                            <SelectField
                                label="Frecuencia"
                                value={cadence}
                                onChange={(e) => setCadence(e.target.value)}
                            >
                                {Object.entries(CADENCE_LABELS).map(([value, label]) => (
                                    <option key={value} value={value}>{label}</option>
                                ))}
                            </SelectField>
                            <label className="block">
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Día de cobro</span>
                                <input
                                    type="number"
                                    min="1"
                                    max="31"
                                    value={dayOfMonth}
                                    onChange={(e) => setDayOfMonth(e.target.value)}
                                    className="mt-1 w-full rounded-xl border border-foreground/10 bg-background px-3 py-2 text-sm"
                                />
                            </label>
                            <SelectField
                                label="Categoría"
                                value={categoryId}
                                onChange={(e) => setCategoryId(e.target.value)}
                                wrapperClassName="sm:col-span-2"
                            >
                                <option value="">Sin categoría</option>
                                {expenseCategories.map((c: any) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </SelectField>
                        </div>

                        <div className="flex justify-end gap-3">
                            <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
                            <Button type="submit" disabled={createBill.isPending} className="gap-2">
                                {createBill.isPending && <Loader2 size={16} className="animate-spin" />}
                                Guardar
                            </Button>
                        </div>
                    </form>
                </Card>
            ) : (
                <Button onClick={() => setShowForm(true)} className="gap-2">
                    <Plus size={16} /> Agregar compromiso del hogar
                </Button>
            )}

            {/* Lista */}
            <Card className="overflow-hidden">
                {isLoading ? (
                    <div className="p-10 flex justify-center">
                        <Loader2 size={20} className="animate-spin opacity-40" />
                    </div>
                ) : bills.length === 0 ? (
                    <div className="p-12 text-center space-y-2">
                        <CheckCircle2 size={28} className="mx-auto opacity-30" />
                        <Typography variant="body" className="font-bold">Sin compromisos del hogar</Typography>
                        <Typography variant="small" className="text-muted-foreground">
                            Registra el arriendo, los servicios y los seguros para ver el costo real del mes.
                        </Typography>
                    </div>
                ) : (
                    <ul className="divide-y divide-foreground/5">
                        {bills.map((bill) => (
                            <li key={bill.id} className="flex items-center justify-between gap-4 p-4">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`font-bold ${bill.is_active ? "" : "opacity-40 line-through"}`}>
                                            {bill.name}
                                        </span>
                                        {bill.is_overdue && (
                                            <span className="rounded-full bg-rose-50 border border-rose-100 px-2 py-0.5 text-[9px] font-black uppercase text-rose-700 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-500/20">
                                                Vencido
                                            </span>
                                        )}
                                        {!bill.is_active && (
                                            <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[9px] font-black uppercase opacity-60">
                                                Inactivo
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                        <span className="text-[11px] opacity-60">{CADENCE_LABELS[bill.cadence]}</span>
                                        {bill.category_name && (
                                            <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[9px] font-bold text-blue-600 dark:text-blue-400">
                                                {bill.category_name}
                                            </span>
                                        )}
                                        {bill.days_until_due !== null && (
                                            <span className={`text-[11px] font-bold ${bill.is_overdue ? "text-rose-500" : "opacity-60"}`}>
                                                {daysLabel(bill)}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="text-right whitespace-nowrap">
                                    <div className="font-black">{formatCurrency(bill.amount)}</div>
                                    {bill.monthly_equivalent !== bill.amount && (
                                        <div className="text-[10px] opacity-50">
                                            ≈ {formatCurrency(bill.monthly_equivalent)}/mes
                                        </div>
                                    )}
                                </div>

                                <button
                                    onClick={() => deleteBill.mutate(bill.id)}
                                    className="opacity-30 hover:opacity-100 hover:text-rose-500 transition-opacity cursor-pointer"
                                    aria-label={`Eliminar ${bill.name}`}
                                >
                                    <Trash2 size={16} />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </Card>
        </div>
    );
}
