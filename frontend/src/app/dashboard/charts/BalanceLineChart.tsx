// src/app/dashboard/charts/BalanceLineChart.tsx
'use client';

import React from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    ResponsiveContainer,
} from 'recharts';

interface Account {
    id: string;
    balance: number;
    type: string;
    name?: string;
}
interface Transaction {
    id: string;
    amount: number;
    category?: string;
    date: string; // ISO string
    type: 'income' | 'expense' | 'transfer';
}

interface Props {
    accounts: Account[];
    transactions: Transaction[];
}

// Build daily balance series from transactions
const buildBalanceData = (transactions: Transaction[]) => {
    const sorted = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let cumulative = 0;
    const data: { date: string; balance: number }[] = [];
    sorted.forEach((tx) => {
        cumulative += tx.type === 'income' ? tx.amount : -tx.amount;
        data.push({ date: tx.date.slice(0, 10), balance: cumulative });
    });
    return data;
};

const BalanceLineChart: React.FC<Props> = ({ transactions }) => {
    const data = React.useMemo(() => buildBalanceData(transactions), [transactions]);

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
                <LineChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.05} />
                    <XAxis
                        dataKey="date"
                        fontSize={8}
                        tick={{ fill: 'currentColor', opacity: 0.4 }}
                        axisLine={false}
                        tickLine={false}
                        className="text-foreground"
                    />
                    <YAxis
                        hide
                    />
                    <Tooltip
                        formatter={(value: number | undefined) => [formatCurrency(value ?? 0), 'Balance']}
                        contentStyle={{
                            borderRadius: '12px',
                            border: '1px solid rgba(var(--foreground), 0.1)',
                            backgroundColor: 'var(--card)',
                            boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                            color: 'var(--foreground)'
                        }}
                        itemStyle={{ color: 'var(--foreground)' }}
                    />
                    <Line
                        type="monotone"
                        dataKey="balance"
                        stroke="#6366F1"
                        strokeWidth={3}
                        dot={false}
                        activeDot={{ r: 6, stroke: '#6366F1', strokeWidth: 2, fill: '#fff' }}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}

export default BalanceLineChart;
