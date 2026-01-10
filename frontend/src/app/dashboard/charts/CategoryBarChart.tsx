// src/app/dashboard/charts/CategoryBarChart.tsx
'use client';

import React, { useMemo } from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Cell,
} from 'recharts';

interface Transaction {
    id: string;
    amount: number;
    category?: string;
    date: string;
    type: 'income' | 'expense' | 'transfer';
    category_name?: string;
    categories?: { name: string } | null;
}

interface Props {
    transactions: Transaction[];
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1'];

const CategoryBarChart: React.FC<Props> = ({ transactions }) => {
    const data = useMemo(() => {
        const map: Record<string, number> = {};
        transactions
            .filter(t => t.type === 'expense')
            .forEach(t => {
                const catName = t.category_name || t.categories?.name || 'Varios';
                map[catName] = (map[catName] || 0) + Number(t.amount);
            });

        return Object.entries(map)
            .map(([category, amount]) => ({ category, amount }))
            .sort((a, b) => b.amount - a.amount); // Sort by amount descending
    }, [transactions]);

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(value);
    };

    if (data.length === 0) {
        return (
            <div className="flex h-64 items-center justify-center text-foreground/30">
                No hay datos de gastos para mostrar.
            </div>
        );
    }

    return (
        <div className="h-full w-full">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart
                    data={data}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                >
                    <XAxis type="number" hide />
                    <YAxis
                        dataKey="category"
                        type="category"
                        fontSize={10}
                        width={80}
                        tick={{ fill: 'currentColor', opacity: 0.6 }}
                        className="text-foreground"
                    />
                    <Tooltip
                        formatter={(value: number | undefined) => [formatCurrency(value ?? 0), 'Gastos']}
                        cursor={{ fill: 'currentColor', opacity: 0.05 }}
                        contentStyle={{
                            borderRadius: '12px',
                            border: '1px solid rgba(var(--foreground), 0.1)',
                            backgroundColor: 'var(--card)',
                            boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                            color: 'var(--foreground)'
                        }}
                        itemStyle={{ color: 'var(--foreground)' }}
                    />
                    <Bar dataKey="amount" radius={[0, 4, 4, 0]} barSize={20}>
                        {data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

export default CategoryBarChart;
