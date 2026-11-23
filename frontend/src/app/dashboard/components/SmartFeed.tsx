'use client'

import { Typography } from '@/components/ui/atoms/Typography'
import { AlertCircle, Brain, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { useRecurringBills } from '@/hooks/useRecurringBills'
import { formatCurrency } from '@/utils/format'
import { useMemo } from 'react'
import { motion } from 'framer-motion'

import { useBudgets } from '@/hooks/useBudgets';
import { useDebts } from '@/hooks/useDebts';
import { isBudgetActiveNow } from '@/app/dashboard/lib/budgetPeriod';

interface SmartFeedProps {
    currentDate: Date | null;
}

type PayableDebt = {
    id: string;
    type: string;
    status: string;
    due_date?: string | null;
    remaining_amount: number;
    description: string;
};

export default function SmartFeed({ currentDate }: SmartFeedProps) {
    const { budgets, error: budgetsError } = useBudgets();
    const { debts, error: debtsError } = useDebts();
    const { overdue, dueNext7Days, error: billsError } = useRecurringBills();

    const today = useMemo(() => currentDate ?? new Date(), [currentDate]);

    /**
     * Los presupuestos del período actual. `spent`, `percent` y `status` los
     * calcula el servidor (`GET /budgets/`), acotados al mes/semana de cada
     * presupuesto. El dashboard ya NO vuelve a sumar los movimientos: así el
     * aviso coincide con la página de presupuestos y con `/insights`.
     */
    const activeBudgets = useMemo(
        () => budgets.filter((b: any) => isBudgetActiveNow(b, today)),
        [budgets, today]
    );

    const budgetAlerts = useMemo(
        () => activeBudgets.filter((b: any) => {
            if (b.status) return b.status !== 'ok';
            return Number(b.percent) >= 80;
        }),
        [activeBudgets]
    );

    const todayKey = new Intl.DateTimeFormat('sv-SE').format(today);
    const debtAlerts = (debts as PayableDebt[]).flatMap((debt) => {
        if (debt.type !== 'to_pay' || debt.status !== 'active' || !debt.due_date || debt.remaining_amount <= 0) return [];
        const days = (Date.parse(String(debt.due_date).slice(0, 10)) - Date.parse(todayKey)) / 86400000;
        return Number.isFinite(days) && days <= 7
            ? [{ id: `debt-${debt.id}`, name: debt.description, amount: debt.remaining_amount, days, href: '/debts' }]
            : [];
    });
    const billAlerts = overdue.concat(dueNext7Days).flatMap((bill) =>
        bill.is_active && bill.days_until_due !== null
            ? [{ id: `bill-${bill.id}`, name: bill.name, amount: bill.amount, days: bill.days_until_due, href: '/resources?section=payments' }]
            : []
    );

    // Combine all "feed items" into a single list
    const feedItems = [
        // 1. Debts
        ...[...debtAlerts, ...billAlerts].map(({id, name, amount, days, href}) => ({
            id, href,
            priority: days < 0 ? 0 : days === 0 ? 1 : 3,
            action: href === '/debts' ? 'Revisar deuda' : 'Revisar pago',
            icon: <AlertCircle size={20} className={days <= 0 ? 'text-rose-500' : 'text-orange-500'} />,
            title: name,
            message: `${days < 0 ? `Venció hace ${-days} d` : days === 0 ? 'Vence hoy' : days === 1 ? 'Vence mañana' : `Vence en ${days} días`} · ${formatCurrency(amount)} por pagar`,
            bgColor: 'bg-card',
            borderColor: 'border-foreground/10'
        })),

        // 2. Budget Alerts (gastado real del período, calculado en el servidor)
        ...budgetAlerts.map((b: any) => ({
            id: `budget-${b.id}`,
            href: '/budgets',
            action: 'Revisar límite',
            priority: Number(b.percent) >= 100 ? 2 : 4,
            icon: <AlertTriangle size={20} className={b.status === 'critical' ? 'text-rose-500' : 'text-orange-500'} />,
            title: b.category_name || b.categories?.name || 'Presupuesto',
            message: Number(b.spent) > Number(b.amount)
                ? `Excediste el límite por ${formatCurrency(Number(b.spent) - Number(b.amount))}.`
                : `Te quedan ${formatCurrency(Number(b.amount) - Number(b.spent))} del límite de este período.`,
            bgColor: b.status === 'critical' ? 'bg-rose-50 dark:bg-rose-900/10' : 'bg-orange-50 dark:bg-orange-900/10',
            borderColor: b.status === 'critical' ? 'border-rose-100 dark:border-rose-900/30' : 'border-orange-100 dark:border-orange-900/30'
        }))
    ].sort((a, b) => a.priority - b.priority)

    if (!currentDate || (!feedItems.length && !budgetsError && !debtsError && !billsError)) return null;

    return (
        <div className="w-full overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2 mb-3 px-1">
                <Brain className="text-indigo-500" size={18} />
                <Typography variant="small" className="text-foreground/70 font-black uppercase tracking-widest text-[10px]">Requiere atención</Typography>
            </div>
            {(budgetsError || debtsError || billsError) && <p role="status" className="mb-3 text-sm text-muted-foreground">Algunas alertas no se pudieron cargar.</p>}

            {/* Responsive Container: Horizontal Scroll on Mobile, Grid on Desktop */}
            <div className="
                flex gap-3 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide -mx-4 px-4
                md:mx-0 md:px-0 md:overflow-visible md:pb-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-4
            ">
                {feedItems.map((item) => (
                    <motion.div
                        key={item.id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`
                            snap-center shrink-0 w-[280px] md:w-auto
                            p-4 rounded-2xl border ${item.borderColor} ${item.bgColor}
                            flex flex-col justify-between gap-3 h-full
                        `}
                    >
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-white/80 dark:bg-black/20 rounded-lg backdrop-blur-sm shadow-sm">
                                {item.icon}
                            </div>
                            <Typography variant="small" className="font-bold uppercase tracking-wide opacity-70 text-[10px]">
                                {item.title}
                            </Typography>
                        </div>
                        <Typography variant="body" className="leading-snug font-medium text-sm">
                            {item.message}
                        </Typography>
                        <Link href={item.href} className="text-sm font-bold text-primary underline-offset-4 hover:underline">{item.action}</Link>
                    </motion.div>
                ))}
            </div>
        </div>
    )
}
