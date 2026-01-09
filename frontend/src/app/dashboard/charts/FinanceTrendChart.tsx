'use client'

import { useState, useMemo } from 'react'
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from 'recharts'
import { Card } from '@/components/ui/molecules/Card'
import { Typography } from '@/components/ui/atoms/Typography'
import { formatCurrency } from '@/utils/format'
import { startOfMonth, endOfMonth, subMonths, format, parseISO, isWithinInterval, startOfDay, endOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { Calendar as CalendarIcon, ChevronDown, TrendingUp } from 'lucide-react'

interface Transaction {
    id: string
    amount: number
    type: 'income' | 'expense'
    date: string
    description?: string
}

interface Props {
    transactions: Transaction[]
}

type Granularity = 'daily' | 'monthly'

export default function FinanceTrendChart({ transactions }: Props) {
    const [granularity, setGranularity] = useState<Granularity>('monthly')
    const [dateRange, setDateRange] = useState({
        start: startOfMonth(subMonths(new Date(), 5)).toISOString().split('T')[0], // Last 6 months
        end: endOfMonth(new Date()).toISOString().split('T')[0]
    })

    const data = useMemo(() => {
        const start = new Date(dateRange.start)
        const end = new Date(dateRange.end)

        // Filter transactions within range
        const filtered = transactions.filter(t => isWithinInterval(parseISO(t.date), { start, end }))

        // Aggregation grouping
        const grouped: Record<string, { date: string, income: number, expense: number }> = {}

        const getGroupKey = (dateStr: string) => {
            const date = parseISO(dateStr)
            if (granularity === 'daily') return format(date, 'yyyy-MM-dd')
            return format(date, 'yyyy-MM')
        }

        filtered.forEach(t => {
            const key = getGroupKey(t.date)
            if (!grouped[key]) {
                grouped[key] = {
                    date: key,
                    income: 0,
                    expense: 0
                }
            }
            if (t.type === 'income') grouped[key].income += Number(t.amount)
            if (t.type === 'expense') grouped[key].expense += Number(t.amount)
        })

        // Sort by date
        return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date)).map(item => ({
            ...item,
            displayDate: granularity === 'daily'
                ? format(parseISO(item.date), 'd MMM', { locale: es })
                : format(parseISO(item.date + '-01'), 'MMM yyyy', { locale: es })
        }))

    }, [transactions, granularity, dateRange])

    // Empty State Check
    if (!transactions || transactions.length === 0) {
        return (
            <div className="h-[300px] w-full flex flex-col items-center justify-center text-center p-6 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-full mb-3">
                    <TrendingUp size={32} className="text-indigo-300" />
                </div>
                <Typography variant="h3" className="text-slate-500 font-bold mb-1">Sin datos suficientes</Typography>
                <Typography variant="small" className="text-slate-400">Registra tus primeros ingresos y gastos para ver la tendencia financiera.</Typography>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex space-x-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                    <button
                        onClick={() => setGranularity('daily')}
                        className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${granularity === 'daily'
                            ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        Diario
                    </button>
                    <button
                        onClick={() => setGranularity('monthly')}
                        className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${granularity === 'monthly'
                            ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        Mensual
                    </button>
                </div>

                <div className="flex items-center space-x-2">
                    <div className="relative">
                        <input
                            type="date"
                            value={dateRange.start}
                            onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                            className="pl-8 pr-2 py-1 text-xs font-bold bg-slate-100 dark:bg-slate-800 rounded-lg border-none focus:ring-2 focus:ring-indigo-500 outline-none text-slate-600"
                        />
                        <CalendarIcon size={12} className="absolute left-2.5 top-2 text-slate-400" />
                    </div>
                    <span className="text-slate-300">-</span>
                    <div className="relative">
                        <input
                            type="date"
                            value={dateRange.end}
                            onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                            className="pl-8 pr-2 py-1 text-xs font-bold bg-slate-100 dark:bg-slate-800 rounded-lg border-none focus:ring-2 focus:ring-indigo-500 outline-none text-slate-600"
                        />
                        <CalendarIcon size={12} className="absolute left-2.5 top-2 text-slate-400" />
                    </div>
                </div>
            </div>

            <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10B981" stopOpacity={0.2} />
                                <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#F43F5E" stopOpacity={0.2} />
                                <stop offset="95%" stopColor="#F43F5E" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.5} />
                        <XAxis
                            dataKey="displayDate"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 10, fill: '#64748B' }}
                            dy={10}
                        />
                        <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 10, fill: '#64748B' }}
                            tickFormatter={(value) => `$${value}`}
                        />
                        <Tooltip
                            content={({ active, payload, label }) => {
                                if (active && payload && payload.length) {
                                    return (
                                        <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm p-3 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 text-xs">
                                            <p className="font-bold mb-2 text-slate-700 dark:text-slate-200">{label}</p>
                                            <div className="space-y-1">
                                                {payload.map((p: any) => (
                                                    <div key={p.name} className="flex items-center gap-2">
                                                        <div className={`w-2 h-2 rounded-full ${p.dataKey === 'income' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                                        <span className="capitalize text-slate-500">{p.dataKey === 'income' ? 'Ingresos' : 'Gastos'}:</span>
                                                        <span className="font-mono font-bold">{formatCurrency(p.value)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )
                                }
                                return null
                            }}
                        />
                        <Area
                            type="monotone"
                            dataKey="income"
                            stroke="#10B981"
                            strokeWidth={3}
                            fillOpacity={1}
                            fill="url(#colorIncome)"
                        />
                        <Area
                            type="monotone"
                            dataKey="expense"
                            stroke="#F43F5E"
                            strokeWidth={3}
                            fillOpacity={1}
                            fill="url(#colorExpense)"
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    )
}
