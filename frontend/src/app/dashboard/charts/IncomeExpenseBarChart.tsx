// src/app/dashboard/charts/IncomeExpenseBarChart.tsx
'use client';

import React, { useState, useMemo } from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    Legend,
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

const aggregateMonthly = (transactions: Transaction[]) => {
    const map: Record<string, { income: number; expense: number }> = {};
    transactions.forEach((tx) => {
        const month = tx.date.slice(0, 7); // YYYY-MM
        if (!map[month]) {
            map[month] = { income: 0, expense: 0 };
        }
        if (tx.type === 'income') {
            map[month].income += Number(tx.amount);
        } else {
            map[month].expense += Number(tx.amount);
        }
    });
    return Object.entries(map)
        .map(([label, values]) => ({ label, income: values.income, expense: values.expense }))
        .sort((a, b) => a.label.localeCompare(b.label));
};

const aggregateDaily = (transactions: Transaction[]) => {
    const map: Record<string, { income: number; expense: number }> = {};
    // Last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    transactions.forEach((tx) => {
        const txDate = new Date(tx.date);
        if (txDate >= thirtyDaysAgo) {
            const day = tx.date.slice(0, 10); // YYYY-MM-DD
            if (!map[day]) {
                map[day] = { income: 0, expense: 0 };
            }
            if (tx.type === 'income') {
                map[day].income += Number(tx.amount);
            } else {
                map[day].expense += Number(tx.amount);
            }
        }
    });
    return Object.entries(map)
        .map(([label, values]) => ({ label, income: values.income, expense: values.expense }))
        .sort((a, b) => a.label.localeCompare(b.label));
};

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(value);
};

const IncomeExpenseBarChart: React.FC<Props> = ({ transactions }) => {
    const [view, setView] = useState<'daily' | 'monthly'>('daily');

    const data = useMemo(() => {
        return view === 'daily' ? aggregateDaily(transactions) : aggregateMonthly(transactions);
    }, [transactions, view]);

    return (
        <div className="flex flex-col h-full">
            <div className="flex justify-center mb-4 space-x-2">
                <button
                    onClick={() => setView('daily')}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${view === 'daily'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                >
                    Diario
                </button>
                <button
                    onClick={() => setView('monthly')}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${view === 'monthly'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                >
                    Mensual
                </button>
            </div>

            <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                        <XAxis
                            dataKey="label"
                            fontSize={10}
                            tickFormatter={(val) => view === 'daily' ? val.slice(8, 10) : val}
                        />
                        <YAxis
                            fontSize={10}
                            tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
                        />
                        <Tooltip
                            formatter={(value: number | undefined) => [formatCurrency(value ?? 0), '']}
                            labelClassName="font-bold text-gray-700"
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        />
                        <Legend verticalAlign="top" align="right" />
                        <Bar dataKey="income" name="Ingresos" fill="#10b981" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="expense" name="Gastos" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default IncomeExpenseBarChart;
