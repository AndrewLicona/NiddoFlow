// src/app/dashboard/charts/UserExpensesPieChart.tsx
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
    user_id: string;
    type: 'income' | 'expense';
}

interface Profile {
    id: string;
    full_name: string | null;
}

interface Props {
    transactions: Transaction[];
    profiles: Profile[];
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1'];

const UserExpensesPieChart: React.FC<Props> = ({ transactions, profiles }) => {
    const data = useMemo(() => {
        const userMap: Record<string, number> = {};
        const profileMap: Record<string, string> = {};

        profiles.forEach(p => {
            profileMap[p.id] = p.full_name || 'Usuario';
        });

        transactions
            .filter(t => t.type === 'expense')
            .forEach(t => {
                const name = profileMap[t.user_id] || 'Desconocido';
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
            <div className="flex h-64 items-center justify-center text-gray-400">
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
                        innerRadius={60}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                    >
                        {data.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                    </Pie>
                    <Tooltip
                        formatter={(value: number | undefined) => [formatCurrency(value ?? 0), 'Total Gastado']}
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    />
                    <Legend verticalAlign="bottom" height={36} />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
};

export default UserExpensesPieChart;
