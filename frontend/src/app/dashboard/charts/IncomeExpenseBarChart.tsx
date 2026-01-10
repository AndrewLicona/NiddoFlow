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
    category?: string;
    date: string; // ISO string
    type: 'income' | 'expense' | 'transfer';
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
            <div className="flex justify-center mb-6 space-x-2">
                <button
                    onClick={() => setView('daily')}
                    className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${view === 'daily'
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                        : 'bg-foreground/5 text-foreground/60 hover:bg-foreground/10'
                        }`}
                >
                    Diario
                </button>
                <button
                    onClick={() => setView('monthly')}
                    className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${view === 'monthly'
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                        : 'bg-foreground/5 text-foreground/60 hover:bg-foreground/10'
                        }`}
                >
                    Mensual
                </button>
            </div>

            <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.05} />
                        <XAxis
                            dataKey="label"
                            fontSize={8}
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: 'currentColor', opacity: 0.4 }}
                            tickFormatter={(val) => view === 'daily' ? val.slice(8, 10) : val.slice(5, 7)}
                            className="text-foreground"
                        />
                        <YAxis
                            fontSize={8}
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: 'currentColor', opacity: 0.4 }}
                            tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
                            className="text-foreground"
                        />
                        <Tooltip
                            formatter={(value: number | undefined) => [formatCurrency(value ?? 0), '']}
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
                            verticalAlign="top"
                            align="right"
                            iconType="circle"
                            formatter={(value) => <span className="text-foreground/60 text-[10px] font-bold uppercase tracking-wider">{value}</span>}
                        />
                        <Bar dataKey="income" name="Ingresos" fill="#10B981" radius={[4, 4, 0, 0]} barSize={12} />
                        <Bar dataKey="expense" name="Gastos" fill="#F43F5E" radius={[4, 4, 0, 0]} barSize={12} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default IncomeExpenseBarChart;
