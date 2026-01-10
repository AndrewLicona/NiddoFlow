'use client'

import { useMemo } from 'react'
import { generateInsights, Transaction, Budget } from '@/utils/analytics'
import { Typography } from '@/components/ui/atoms/Typography'
import { TrendingUp, TrendingDown, PieChart, AlertTriangle, Sparkles, Lightbulb, PiggyBank, CalendarClock, Activity } from 'lucide-react'

interface Props {
    transactions: Transaction[]
    budgets?: Budget[]
}

export default function InsightsFeed({ transactions, budgets = [] }: Props) {
    const insights = useMemo(() => generateInsights(transactions, budgets), [transactions, budgets])

    const getIcon = (iconName?: string) => {
        switch (iconName) {
            case 'TrendingUp': return <TrendingUp size={20} />
            case 'TrendingDown': return <TrendingDown size={20} />
            case 'PieChart': return <PieChart size={20} />
            case 'AlertTriangle': return <AlertTriangle size={20} />
            case 'Sparkles': return <Sparkles size={20} />
            case 'PiggyBank': return <PiggyBank size={20} />
            case 'CalendarClock': return <CalendarClock size={20} />
            case 'Activity': return <Activity size={20} />
            default: return <Lightbulb size={20} />
        }
    }

    const getColors = (type: string) => {
        switch (type) {
            case 'warning': return 'bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-500/20'
            case 'success': return 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-500/20'
            case 'info': return 'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-500/20'
            default: return 'bg-slate-50 text-slate-700 border-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
        }
    }

    return (
        <div className="space-y-4">
            {insights.map(insight => (
                <div
                    key={insight.id}
                    className={`p-4 rounded-xl border flex gap-3 shadow-sm transition-all hover:shadow-md ${getColors(insight.type)}`}
                >
                    <div className="shrink-0 mt-0.5 opacity-80">
                        {getIcon(insight.icon)}
                    </div>
                    <div>
                        <Typography variant="body" className="font-bold text-xs uppercase opacity-70 mb-0.5 tracking-wider">
                            {insight.metric || 'Insight'}
                        </Typography>
                        <p className="text-sm font-medium leading-relaxed">
                            {insight.message}
                        </p>
                    </div>
                </div>
            ))}
        </div>
    )
}
