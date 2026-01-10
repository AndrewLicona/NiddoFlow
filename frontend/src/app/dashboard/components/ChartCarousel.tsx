'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight, TrendingUp, PieChart, BarChart3, LineChart, AreaChart, Users } from 'lucide-react'
import { Typography } from '@/components/ui/atoms/Typography'
import { Card } from '@/components/ui/molecules/Card'
import FinanceTrendChart from '../charts/FinanceTrendChart'
import ExpenseDistributionChart from '../charts/ExpenseDistributionChart'
import BalanceLineChart from '../charts/BalanceLineChart'
import IncomeExpenseBarChart from '../charts/IncomeExpenseBarChart'
import CategoryBarChart from '../charts/CategoryBarChart'
import ExpensesAreaChart from '../charts/ExpensesAreaChart'
import UserExpensesPieChart from '../charts/UserExpensesPieChart'

interface Transaction {
    id: string;
    amount: number;
    type: 'income' | 'expense' | 'transfer';
    categories?: { name: string } | null;
    date: string;
}

interface Account {
    id: string;
    balance: number;
    type: string;
    name?: string;
}

interface Profile {
    id: string;
    full_name: string | null;
}

interface Props {
    transactions: Transaction[]
    accounts: Account[]
    profiles: Profile[]
}

export default function ChartCarousel({ transactions, accounts, profiles }: Props) {
    const [page, setPage] = useState(0)

    // Prepare distribution data for the specific component that needs it in a special format
    const expensesByCategory = transactions
        .filter(t => t.type === 'expense')
        .reduce((acc: Record<string, number>, curr: Transaction) => {
            const catName = curr.categories?.name || 'Otros'
            acc[catName] = (acc[catName] || 0) + Number(curr.amount)
            return acc
        }, {})

    const distributionData = Object.entries(expensesByCategory).map(([name, value]) => ({
        name,
        value: Number(value),
        color: ''
    }))

    const charts = [
        {
            id: 'trend',
            title: 'Tendencias (Ingresos vs Gastos)',
            icon: <TrendingUp className="text-indigo-500" size={24} />,
            component: <FinanceTrendChart transactions={transactions} />
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
