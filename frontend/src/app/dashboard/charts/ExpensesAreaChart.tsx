'use client';

import React from 'react';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    ResponsiveContainer,
} from 'recharts';

interface Transaction {
    id: string;
    amount: number;
    category: string;
    date: string; // ISO string
    type: 'income' | 'expense';
}

interface Props {
    transactions: Transaction[];
}

const buildAreaData = (transactions: Transaction[]) => {
    const sorted = [...transactions]
        .filter(t => t.type === 'expense')
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let cumulative = 0;
    const data: { date: string; amount: number }[] = [];
    sorted.forEach((tx) => {
        cumulative += tx.amount;
        data.push({ date: tx.date.slice(0, 10), amount: cumulative });
    });
    return data;
};

const ExpensesAreaChart: React.FC<Props> = ({ transactions }) => {
    const data = React.useMemo(() => buildAreaData(transactions), [transactions]);

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(value);
    };

    return (
        <div className="h-full w-full">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                    <defs>
                        <linearGradient id="colorArea" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#F43F5E" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#F43F5E" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.05} />
                    <XAxis
                        dataKey="date"
                        fontSize={8}
                        tick={{ fill: 'currentColor', opacity: 0.4 }}
                        axisLine={false}
                        tickLine={false}
                        className="text-foreground"
                    />
                    <YAxis hide />
                    <Tooltip
                        formatter={(value: number | undefined) => [formatCurrency(value ?? 0), 'Gastos']}
                        contentStyle={{
                            borderRadius: '12px',
                            border: '1px solid rgba(var(--foreground), 0.1)',
                            backgroundColor: 'var(--card)',
                            boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                            color: 'var(--foreground)'
                        }}
                        itemStyle={{ color: 'var(--foreground)' }}
                    />
                    <Area
                        type="monotone"
                        dataKey="amount"
                        stroke="#F43F5E"
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#colorArea)"
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
};

export default ExpensesAreaChart;
