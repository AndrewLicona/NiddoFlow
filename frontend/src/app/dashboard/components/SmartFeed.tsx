'use client'

import { Typography } from '@/components/ui/atoms/Typography'
import { AlertCircle, Brain, TrendingUp, TrendingDown, PieChart, AlertTriangle, Sparkles, Lightbulb, PiggyBank, CalendarClock, Activity } from 'lucide-react'
import { formatCurrency } from '@/utils/format'
import { useMemo } from 'react'
import { generateInsights, Budget, Transaction } from '@/utils/analytics'
import { motion } from 'framer-motion'

import { useTransactions } from '@/hooks/useTransactions';
import { useBudgets } from '@/hooks/useBudgets';
import { useDebts } from '@/hooks/useDebts';
import { Loader2 } from 'lucide-react';

export default function SmartFeed() {
    const { transactions, isLoading: txLoading } = useTransactions();
    const { budgets, isLoading: budgetsLoading } = useBudgets();
    const { debts, isLoading: debtsLoading } = useDebts();
    const budgetStats = useMemo(() => {
        return budgets.map((budget: any) => {
            const spent = transactions
                .filter((t: any) => t.type === 'expense' && t.category_id === budget.category_id)
                .reduce((acc: number, t: any) => acc + t.amount, 0);
            const percent = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;
            return { ...budget, spent, percent };
        });
    }, [budgets, transactions]);

    const budgetAlerts = useMemo(() =>
        budgetStats.filter((b: any) => b.percent >= 80),
        [budgetStats]);

    const debtToPay = useMemo(() =>
        debts
            .filter((d: any) => d.type === 'to_pay' && d.status === 'active')
            .reduce((acc: number, d: any) => acc + d.remaining_amount, 0),
        [debts]);

    const insights = useMemo(() => generateInsights(transactions, budgets), [transactions, budgets])

    // Combine all "feed items" into a single list
    const feedItems = [
        // 1. Debts
        ...(debtToPay > 0 ? [{
            id: 'debt-alert',
            type: 'critical',
            icon: <AlertCircle size={20} className="text-rose-500" />,
            title: 'Compromisos',
            message: `Cuentas por pagar: ${formatCurrency(debtToPay)}`,
            bgColor: 'bg-rose-50 dark:bg-rose-900/10',
            borderColor: 'border-rose-100 dark:border-rose-900/30'
        }] : []),

        // 2. Budget Alerts
        ...budgetAlerts.map((b: any) => ({
            id: `budget-${b.id}`,
            type: 'warning',
            icon: <AlertTriangle size={20} className="text-orange-500" />,
            title: 'Presupuesto',
            message: `${b.category_name || b.categories?.name || 'Categoría'} al ${(b.percent).toFixed(0)}%`,
            bgColor: 'bg-orange-50 dark:bg-orange-900/10',
            borderColor: 'border-orange-100 dark:border-orange-900/30'
        })),

        // 3. AI Insights
        ...insights.map((i: any) => ({
            id: i.id,
            type: i.type,
            icon: getIcon(i.icon),
            title: i.metric || 'Insight',
            message: i.message,
            bgColor: 'bg-indigo-50 dark:bg-indigo-900/10',
            borderColor: 'border-indigo-100 dark:border-indigo-900/30'
        }))
    ]

    if (txLoading || budgetsLoading || debtsLoading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="animate-spin text-indigo-600" size={24} />
            </div>
        );
    }

    if (feedItems.length === 0) {
        return (
            <div className="flex items-center gap-3 p-4 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-2xl border border-emerald-100 dark:border-emerald-900/20">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-full">
                    <Sparkles size={16} className="text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                    <Typography variant="small" className="font-bold text-emerald-800 dark:text-emerald-200">Todo en orden</Typography>
                    <Typography variant="small" className="text-emerald-600 dark:text-emerald-400 opacity-80 text-[10px]">No hay alertas ni anomalías por ahora.</Typography>
                </div>
            </div>
        )
    }

    return (
        <div className="w-full overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2 mb-3 px-1">
                <Brain className="text-indigo-500" size={18} />
                <Typography variant="small" className="text-foreground/70 font-black uppercase tracking-widest text-[10px]">Centro de Inteligencia</Typography>
            </div>

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
                    </motion.div>
                ))}
            </div>
        </div>
    )
}

function getIcon(iconName?: string) {
    switch (iconName) {
        case 'TrendingUp': return <TrendingUp size={20} className="text-rose-500" />
        case 'TrendingDown': return <TrendingDown size={20} className="text-emerald-500" />
        case 'PieChart': return <PieChart size={20} className="text-indigo-500" />
        case 'AlertTriangle': return <AlertTriangle size={20} className="text-orange-500" />
        case 'Sparkles': return <Sparkles size={20} className="text-purple-500" />
        case 'PiggyBank': return <PiggyBank size={20} className="text-pink-500" />
        case 'CalendarClock': return <CalendarClock size={20} className="text-cyan-500" />
        case 'Activity': return <Activity size={20} className="text-blue-500" />
        default: return <Lightbulb size={20} className="text-yellow-500" />
    }
}
