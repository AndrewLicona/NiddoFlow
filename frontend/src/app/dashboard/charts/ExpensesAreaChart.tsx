// src/app/dashboard/charts/ExpensesAreaChart.tsx
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

// Aggregate total expense per month (ignore income)
const aggregateExpenseMonthly = (transactions: Transaction[]) => {
    const map: Record<string, number> = {};
    transactions.forEach((tx) => {
        if (tx.type === 'expense') {
            const month = tx.date.slice(0, 7); // YYYY-MM
            map[month] = (map[month] ?? 0) + tx.amount;
        }
    });
    const data = Object.entries(map)
        .map(([month, expense]) => ({ month, expense }))
        .sort((a, b) => a.month.localeCompare(b.month));
    return data;
};

const ExpensesAreaChart: React.FC<Props> = ({ transactions }) => {
    const data = React.useMemo(() => aggregateExpenseMonthly(transactions), [transactions]);

    return (
        <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Area type="monotone" dataKey="expense" stroke="#f44336" fill="#f44336" fillOpacity={0.3} />
            </AreaChart>
        </ResponsiveContainer>
    );
};

export default ExpensesAreaChart;
