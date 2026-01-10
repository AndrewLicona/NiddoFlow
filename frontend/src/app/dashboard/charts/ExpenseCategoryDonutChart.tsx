'use client';

import React, { useMemo } from 'react';
import {
    PieChart,
    Pie,
    Cell,
    ResponsiveContainer,
    Tooltip,
    Legend,
} from 'recharts';
import { formatCurrency } from '@/utils/format';

interface Transaction {
    id: string;
    amount: number;
    category_name?: string;
    categories?: { name: string } | null;
    type: 'income' | 'expense' | 'transfer';
}

interface Props {
    transactions: Transaction[];
}

const COLORS = ['#6366F1', '#10B981', '#F59E0B', '#F43F5E', '#8B5CF6', '#06B6D4', '#EC4899', '#3B82F6'];

const ExpenseCategoryDonutChart: React.FC<Props> = ({ transactions }) => {
    const data = useMemo(() => {
        const map: Record<string, number> = {};
        transactions
            .filter(t => t.type === 'expense')
            .forEach(t => {
                const catName = t.category_name || t.categories?.name || 'Otros';
                map[catName] = (map[catName] || 0) + Number(t.amount);
            });

        return Object.entries(map)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);
    }, [transactions]);

    if (data.length === 0) {
        return (
            <div className="flex h-64 items-center justify-center text-foreground/30 font-medium">
                No hay gastos para mostrar.
            </div>
        );
    }

    return (
        <div className="h-full w-full">
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie
                        data={data}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={65}
                        paddingAngle={5}
                        dataKey="value"
                    >
                        {data.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} strokeWidth={0} />
                        ))}
                    </Pie>
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
                        verticalAlign="bottom"
                        iconType="circle"
                        wrapperStyle={{ width: '100%', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '4px' }}
                        formatter={(value) => <span className="text-foreground/60 text-[11px] font-bold leading-none">{String(value).length > 20 ? String(value).substring(0, 20) + '...' : value}</span>}
                    />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
};

export default ExpenseCategoryDonutChart;
