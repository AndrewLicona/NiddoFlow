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

interface Transaction {
    id: string;
    amount: number;
    user_id?: string;
    user_name?: string;
    type: 'income' | 'expense' | 'transfer';
}

interface Profile {
    id: string;
    full_name: string | null;
}

interface Props {
    transactions: Transaction[];
    profiles?: Profile[];
}

const COLORS = ['#6366F1', '#10B981', '#F59E0B', '#F43F5E', '#8B5CF6', '#06B6D4', '#EC4899'];

const UserExpensesPieChart: React.FC<Props> = ({ transactions, profiles }) => {
    const data = useMemo(() => {
        const userMap: Record<string, number> = {};
        const profileMap: Record<string, string> = {};

        profiles?.forEach(p => {
            profileMap[p.id] = p.full_name || 'Usuario';
        });

        transactions
            .filter(t => t.type === 'expense')
            .forEach(t => {
                // Use profile map if available, otherwise user_name from transaction, or default
                const name = (profiles && profiles.length > 0 && t.user_id && profileMap[t.user_id])
                    ? profileMap[t.user_id]
                    : t.user_name || 'Desconocido';
                userMap[name] = (userMap[name] || 0) + Number(t.amount);
            });

        return Object.entries(userMap).map(([name, value]) => ({
            name,
            value,
        })).sort((a, b) => b.value - a.value);
    }, [transactions, profiles]);

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
            <div className="flex h-64 items-center justify-center text-foreground/30 font-medium">
                No hay datos de integrantes para mostrar.
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
                        cy="45%"
                        innerRadius={50}
                        outerRadius={70}
                        stroke="none"
                        dataKey="value"

                    >
                        {data.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                    </Pie>
                    <Tooltip
                        formatter={(value: number | undefined) => [formatCurrency(value ?? 0), 'Total Gastado']}
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

export default UserExpensesPieChart;
