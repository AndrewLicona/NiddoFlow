'use client'

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'

type ChartData = {
    name: string
    value: number
    color?: string
}

const COLORS = ['#6366F1', '#10B981', '#F59E0B', '#0b7763ff', '#8B5CF6', '#06B6D4', '#EC4899', '#f68b5c', '#06b6d4', '#2b00ffff', '#f43f5e']

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(value)
}

export default function ExpenseDistributionChart({ data }: { data: ChartData[] }) {
    if (data.length === 0) {
        return (
            <div className="flex h-64 items-center justify-center text-foreground/30">
                No hay datos de gastos este mes
            </div>
        )
    }

    return (
        <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie
                        data={data}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        fill="#8884d8"
                        paddingAngle={5}
                        dataKey="value"
                        stroke="none"
                    >
                        {data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                    </Pie>
                    <Tooltip
                        formatter={(value: number | undefined) => formatCurrency(value ?? 0)}
                        contentStyle={{
                            borderRadius: '12px',
                            border: '1px solid rgba(var(--foreground), 0.1)',
                            backgroundColor: 'var(--card)',
                            boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                            color: 'var(--foreground)'
                        }}
                        itemStyle={{ color: 'var(--foreground)' }}
                    />
                    <Legend
                        verticalAlign="bottom"
                        height={36}
                        formatter={(value) => <span className="text-foreground/70 text-xs font-medium">{value}</span>}
                    />
                </PieChart>
            </ResponsiveContainer>
        </div>
    )
}
