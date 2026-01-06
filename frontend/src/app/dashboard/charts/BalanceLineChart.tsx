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
}
interface Transaction {
    id: string;
    amount: number;
    category: string;
    date: string; // ISO string
    type: 'income' | 'expense';
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

    return (
        <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="balance" stroke="#4caf50" strokeWidth={2} dot={false} />
            </LineChart>
        </ResponsiveContainer>
    );
};

export default BalanceLineChart;
