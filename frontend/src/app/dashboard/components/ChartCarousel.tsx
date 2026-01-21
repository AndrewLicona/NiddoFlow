'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight, TrendingUp, PieChart, BarChart3, LineChart, AreaChart, Users } from 'lucide-react'
import { Typography } from '@/components/ui/atoms/Typography'
import { Card } from '@/components/ui/molecules/Card'
import { useTransactions } from '@/hooks/useTransactions';
import { useAccounts } from '@/hooks/useAccounts';
import { useFamily } from '@/hooks/useFamily';
import { useDashboard } from '@/hooks/useDashboard';
import { Loader2 } from 'lucide-react';
import dynamic from 'next/dynamic';

const FinanceTrendChart = dynamic(() => import('../charts/FinanceTrendChart'), {
    ssr: false,
    loading: () => <div className="w-full h-full animate-pulse bg-foreground/[0.02] rounded-3xl" />
})
const ExpenseDistributionChart = dynamic(() => import('../charts/ExpenseDistributionChart'), { ssr: false })
const BalanceLineChart = dynamic(() => import('../charts/BalanceLineChart'), { ssr: false })
const IncomeExpenseBarChart = dynamic(() => import('../charts/IncomeExpenseBarChart'), { ssr: false })
const CategoryBarChart = dynamic(() => import('../charts/CategoryBarChart'), { ssr: false })
const ExpensesAreaChart = dynamic(() => import('../charts/ExpensesAreaChart'), { ssr: false })
const UserExpensesPieChart = dynamic(() => import('../charts/UserExpensesPieChart'), { ssr: false })



import { ChartEmptyState } from './ChartEmptyState';

// ... (existing imports)

export default function ChartCarousel() {
    const { transactions, isLoading: txLoading } = useTransactions();
    const { accounts, isLoading: accountsLoading } = useAccounts();
    const { members: profiles, isLoading: profilesLoading } = useFamily();
    const { preparedData, isLoading: dashboardLoading } = useDashboard();

    const trends = preparedData.trends;
    const [page, setPage] = useState(0)

    // Helper to check if we have enough data to show interesting charts
    const hasData = (transactions && transactions.length > 0) || (accounts && accounts.length > 0);

    if (txLoading || accountsLoading || profilesLoading || dashboardLoading) {
        return (
            <Card variant="elevated" className="flex items-center justify-center min-h-[450px]">
                <Loader2 className="animate-spin text-indigo-600" size={40} />
            </Card>
        );
    }

    if (!hasData) {
        return <ChartEmptyState />;
    }

    // Prepare distribution data for the specific component that needs it in a special format
    const expensesByCategory = transactions
        .filter((t: any) => t.type === 'expense')
        .reduce((acc: Record<string, number>, curr: any) => {
            const catName = curr.category_name || curr.categories?.name || 'Otros'
            acc[catName] = (acc[catName] || 0) + Number(curr.amount)
            return acc
        }, {})

    const distributionData = Object.entries(expensesByCategory).map(([name, value]: [string, any]) => ({
        name,
        value: Number(value),
        color: ''
    }))

    const charts = [
        {
            id: 'trend',
            title: 'Tendencias (Ingresos vs Gastos)',
            icon: <TrendingUp className="text-indigo-500" size={24} />,
            component: <FinanceTrendChart data={trends} transactions={transactions} />
        },
        {
            id: 'distribution',
            title: 'Distribución de Gastos',
            icon: <PieChart className="text-emerald-500" size={24} />,
            component: <ExpenseDistributionChart data={distributionData} />
        },
        {
            id: 'balance',
            title: 'Balance Acumulado',
            icon: <LineChart className="text-blue-500" size={24} />,
            component: <BalanceLineChart accounts={accounts} transactions={transactions} />
        },
        {
            id: 'net-flow',
            title: 'Flujo Neto',
            icon: <BarChart3 className="text-orange-500" size={24} />,
            component: <IncomeExpenseBarChart transactions={transactions} />
        },
        {
            id: 'ranking',
            title: 'Ranking de Categorías',
            icon: <BarChart3 className="text-purple-500" size={24} />,
            component: <CategoryBarChart transactions={transactions} />
        },
        {
            id: 'area',
            title: 'Evolución de Gastos',
            icon: <AreaChart className="text-pink-500" size={24} />,
            component: <ExpensesAreaChart transactions={transactions} />
        },
        {
            id: 'users',
            title: 'Gastos por Miembro',
            icon: <Users className="text-cyan-500" size={24} />,
            component: <UserExpensesPieChart transactions={transactions} profiles={profiles} />
        }
    ]

    if (txLoading || accountsLoading || profilesLoading || dashboardLoading) {
        return (
            <Card variant="elevated" className="flex items-center justify-center min-h-[450px]">
                <Loader2 className="animate-spin text-indigo-600" size={40} />
            </Card>
        );
    }

    const activeChart = charts[page]

    const paginate = (newDirection: number) => {
        let newPage = page + newDirection
        if (newPage < 0) newPage = charts.length - 1
        if (newPage >= charts.length) newPage = 0
        setPage(newPage)
    }

    return (
        <Card variant="elevated" className="overflow-hidden relative min-h-[450px]">
            {/* Header */}
            <div className="flex justify-between items-center mb-6 px-1">
                <div className="flex items-center gap-2">
                    {activeChart.icon}
                    <motion.div
                        key={activeChart.title}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-col"
                    >
                        <Typography variant="h3" className="text-foreground font-black">
                            {activeChart.title}
                        </Typography>
                    </motion.div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => paginate(-1)}
                        className="p-1.5 rounded-full hover:bg-foreground/5 text-foreground/50 transition-colors"
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <div className="flex gap-1.5">
                        {charts.map((_, idx) => (
                            <div
                                key={idx}
                                className={`w-1.5 h-1.5 rounded-full transition-all ${idx === page ? 'bg-indigo-500 w-3' : 'bg-foreground/20'}`}
                            />
                        ))}
                    </div>
                    <button
                        onClick={() => paginate(1)}
                        className="p-1.5 rounded-full hover:bg-foreground/5 text-foreground/50 transition-colors"
                    >
                        <ChevronRight size={20} />
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="relative">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={page}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.2 }}
                        className="w-full h-[350px]"
                    >
                        {activeChart.component}
                    </motion.div>
                </AnimatePresence>
            </div>
        </Card>
    )
}
