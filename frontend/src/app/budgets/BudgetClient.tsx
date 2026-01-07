// src/app/budgets/BudgetClient.tsx
'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { formatCurrency } from '@/utils/format';
import { Typography } from '@/components/ui/atoms/Typography';
import { Button } from '@/components/ui/atoms/Button';
import { Card } from '@/components/ui/molecules/Card';
import { InputField } from '@/components/ui/molecules/InputField';
import { Plus, Target, Trash2, AlertCircle, CheckCircle2, Calendar, Clock } from 'lucide-react';
import { getWeekNumber, getStartOfWeek } from '@/utils/date';

interface Budget {
    id: string;
    category_id: string;
    category_name?: string;
    amount: number;
    period: 'weekly' | 'biweekly' | 'monthly' | 'custom';
    month?: number;
    week_number?: number;
    year: number;
    start_date?: string;
    end_date?: string;
}

interface Category {
    id: string;
    name: string;
    type: 'income' | 'expense';
}

interface Transaction {
    id: string;
    amount: number;
    category_id: string | null;
    date: string;
    type: 'income' | 'expense' | 'transfer';
}

interface Props {
    initialBudgets: Budget[];
    categories: Category[];
    transactions: Transaction[];
    token: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

export default function BudgetClient({ initialBudgets, categories, transactions, token }: Props) {
    const [budgets, setBudgets] = useState(initialBudgets);
    const [isCreating, setIsCreating] = useState(false);
    const [newBudget, setNewBudget] = useState({
        category_id: '',
        amount: '',
        period: 'monthly' as 'weekly' | 'biweekly' | 'monthly' | 'custom',
        month: new Date().getMonth() + 1,
        week_number: getWeekNumber(new Date()),
        year: new Date().getFullYear(),
        start_date: '',
        end_date: ''
    });

    useEffect(() => {
        if (newBudget.period === 'custom') return;

        const baseDate = new Date(newBudget.year, newBudget.month - 1, 1);
        let start = new Date(newBudget.year, newBudget.month - 1, 1);
        let end = new Date(newBudget.year, newBudget.month, 0);

        if (newBudget.period === 'weekly') {
            // Find start of first week of that month or just use selections
            // For simplicity, if they select week, we could use the week_number
            // But they also want start/end date.
            // Let's stick to month context for now unless they manual edit.
        } else if (newBudget.period === 'biweekly') {
            const today = new Date();
            const isSecondHalf = today.getMonth() + 1 === newBudget.month && today.getDate() > 15;

            if (isSecondHalf) {
                start = new Date(newBudget.year, newBudget.month - 1, 16);
                end = new Date(newBudget.year, newBudget.month, 0);
            } else {
                start = new Date(newBudget.year, newBudget.month - 1, 1);
                end = new Date(newBudget.year, newBudget.month - 1, 15);
            }
        }

        setNewBudget(prev => ({
            ...prev,
            start_date: start.toISOString().split('T')[0],
            end_date: end.toISOString().split('T')[0]
        }));
    }, [newBudget.period, newBudget.month, newBudget.year]);

    const expenseCategories = useMemo(() =>
        categories.filter(c => c.type === 'expense'),
        [categories]);

    const budgetStats = useMemo(() => {
        const currentWeekNumber = getWeekNumber(new Date());
        const currentYear = new Date().getFullYear();

        return budgets.map(budget => {
            const category = categories.find(c => c.id === budget.category_id);

            let relevantTxs = transactions.filter(t =>
                t.type === 'expense' &&
                t.category_id === budget.category_id
            );

            if (budget.start_date && budget.end_date) {
                const start = new Date(budget.start_date);
                const end = new Date(budget.end_date);
                end.setHours(23, 59, 59, 999);

                relevantTxs = relevantTxs.filter(t => {
                    const txDate = new Date(t.date);
                    return txDate >= start && txDate <= end;
                });
            } else if (budget.period === 'weekly') {
                const startOfWeek = getStartOfWeek(budget.week_number || currentWeekNumber, budget.year);
                const endOfWeek = new Date(startOfWeek);
                endOfWeek.setDate(startOfWeek.getDate() + 6);
                endOfWeek.setHours(23, 59, 59, 999);

                relevantTxs = relevantTxs.filter(t => {
                    const txDate = new Date(t.date);
                    return txDate >= startOfWeek && txDate <= endOfWeek;
                });
            } else {
                relevantTxs = relevantTxs.filter(t => {
                    const txDate = new Date(t.date);
                    return txDate.getMonth() + 1 === budget.month &&
                        txDate.getFullYear() === budget.year;
                });
            }

            const spent = relevantTxs.reduce((acc, t) => acc + t.amount, 0);
            const percent = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;

            return {
                ...budget,
                categoryName: category?.name || 'General',
                spent,
                percent,
                remaining: budget.amount - spent
            };
        });
    }, [budgets, categories, transactions]);

    const handleCreateBudget = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch(`${API_URL}/budgets/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    ...newBudget,
                    amount: parseFloat(newBudget.amount),
                    category_id: newBudget.category_id || null
                })
            });

            if (res.ok) {
                const created = await res.json();
                setBudgets([...budgets, created]);
                setIsCreating(false);
                setNewBudget({
                    category_id: '',
                    amount: '',
                    period: 'monthly',
                    month: new Date().getMonth() + 1,
                    week_number: getWeekNumber(new Date()),
                    year: new Date().getFullYear(),
                    start_date: '',
                    end_date: ''
                });
            }
        } catch (error) {
            console.error('Error creating budget:', error);
        }
    };

    const handleDeleteBudget = async (id: string) => {
        try {
            const res = await fetch(`${API_URL}/budgets/${id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (res.ok) {
                setBudgets(budgets.filter(b => b.id !== id));
            }
        } catch (error) {
            console.error('Error deleting budget:', error);
        }
    };

    return (
        <div className="space-y-8 pb-24 min-h-screen">
            <div className="flex justify-end">
                <Button
                    onClick={() => setIsCreating(true)}
                    variant={isCreating ? 'ghost' : 'primary'}
                    className={isCreating ? 'hidden' : ''}
                >
                    <Plus size={18} className="mr-2" />
                    Nuevo Presupuesto
                </Button>
            </div>

            {isCreating && (
                <Card variant="glass" className="animate-in fade-in slide-in-from-top-4 duration-500 border-blue-500/10 shadow-2xl">
                    <div className="flex items-center space-x-3 mb-8">
                        <div className="p-2 bg-blue-500/10 rounded-xl">
                            <Target size={20} className="text-blue-600" />
                        </div>
                        <Typography variant="h3">Definir Límite de Gasto</Typography>
                    </div>
                    <form onSubmit={handleCreateBudget} className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <InputField
                            label="Categoría"
                            as="select"
                            value={newBudget.category_id}
                            onChange={(e) => setNewBudget({ ...newBudget, category_id: e.target.value })}
                        >
                            <option value="">Selecciona una categoría</option>
                            {expenseCategories.map(cat => (
                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                            ))}
                        </InputField>
                        <InputField
                            label="Monto Máximo"
                            type="number"
                            placeholder="0.00"
                            value={newBudget.amount}
                            onChange={(e) => setNewBudget({ ...newBudget, amount: e.target.value })}
                            required
                        />
                        <InputField
                            label="Frecuencia"
                            as="select"
                            value={newBudget.period}
                            onChange={(e) => setNewBudget({ ...newBudget, period: e.target.value as any })}
                        >
                            <option value="monthly">Mensual</option>
                            <option value="biweekly">Quincenal</option>
                            <option value="weekly">Semanal</option>
                            <option value="custom">Personalizado</option>
                        </InputField>

                        <InputField
                            label="Mes Objetivo"
                            as="select"
                            value={newBudget.month}
                            onChange={(e) => setNewBudget({ ...newBudget, month: parseInt(e.target.value) })}
                        >
                            {Array.from({ length: 12 }, (_, i) => (
                                <option key={i + 1} value={i + 1}>
                                    {new Date(0, i).toLocaleString('es', { month: 'long' })}
                                </option>
                            ))}
                        </InputField>

                        <InputField
                            label="Año"
                            type="number"
                            value={newBudget.year}
                            onChange={(e) => setNewBudget({ ...newBudget, year: parseInt(e.target.value) })}
                        />

                        <div className="md:col-span-1">
                            <InputField
                                label="Fecha Inicio"
                                type="date"
                                value={newBudget.start_date}
                                onChange={(e) => setNewBudget({ ...newBudget, start_date: e.target.value })}
                                required
                            />
                        </div>
                        <div className="md:col-span-1">
                            <InputField
                                label="Fecha Fin"
                                type="date"
                                value={newBudget.end_date}
                                onChange={(e) => setNewBudget({ ...newBudget, end_date: e.target.value })}
                                required
                            />
                        </div>

                        <div className="flex justify-end space-x-4 md:col-span-2 pt-4">
                            <Button type="button" variant="ghost" onClick={() => setIsCreating(false)} className="text-foreground/40 hover:text-foreground">
                                Cancelar
                            </Button>
                            <Button type="submit" className="shadow-lg shadow-blue-500/20 px-8">
                                Crear Ahora
                            </Button>
                        </div>
                    </form>
                </Card>
            )}

            <div className="grid grid-cols-1 gap-8">
                {budgetStats.length === 0 ? (
                    <Card variant="outline" padding="lg" className="text-center py-24 border-dashed border-foreground/10 bg-foreground/[0.01]">
                        <div className="mx-auto h-20 w-20 text-foreground/10 mb-6 bg-foreground/[0.02] rounded-full flex items-center justify-center">
                            <Target size={40} />
                        </div>
                        <Typography variant="h3" className="mb-2">Sin límites definidos</Typography>
                        <Typography variant="body" className="text-foreground/40 mb-10 max-w-xs mx-auto">
                            Establecer presupuestos te ayuda a mantener tus finanzas bajo control.
                        </Typography>
                        <Button onClick={() => setIsCreating(true)} variant="outline">
                            <Plus size={18} className="mr-2" />
                            Definir Primer Límite
                        </Button>
                    </Card>
                ) : (
                    budgetStats.map(budget => (
                        <Card key={budget.id} variant="elevated" className="group hover:scale-[1.005] transition-all duration-300">
                            <div className="flex justify-between items-start mb-8">
                                <div className="flex flex-col space-y-2">
                                    <div className="flex items-center space-x-2">
                                        <div className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest ${budget.period === 'weekly' ? 'bg-blue-500/10 text-blue-600' :
                                                budget.period === 'biweekly' ? 'bg-emerald-500/10 text-emerald-600' :
                                                    budget.period === 'custom' ? 'bg-amber-500/10 text-amber-600' :
                                                        'bg-purple-500/10 text-purple-600'
                                            }`}>
                                            {budget.period === 'weekly' ? 'Semanal' :
                                                budget.period === 'biweekly' ? 'Quincenal' :
                                                    budget.period === 'custom' ? 'Manual' : 'Mensual'}
                                        </div>
                                        <div className="h-px w-4 bg-foreground/10" />
                                        <Typography variant="body" className="font-black opacity-30 uppercase tracking-tighter text-[10px]">
                                            {budget.period === 'weekly' ? `S${budget.week_number} / ${budget.year}` :
                                                budget.period === 'custom' ? budget.year :
                                                    `${new Date(0, (budget.month || 1) - 1).toLocaleString('es', { month: 'short' })} ${budget.year}`}
                                        </Typography>
                                    </div>
                                    {(budget.start_date && budget.end_date) && (
                                        <div className="flex items-center space-x-2 text-foreground/40">
                                            <Calendar size={12} />
                                            <Typography variant="small" className="font-bold text-[9px] lowercase tracking-tight">
                                                {new Date(budget.start_date + 'T00:00:00').toLocaleDateString('es', { day: 'numeric', month: 'short' })} - {new Date(budget.end_date + 'T00:00:00').toLocaleDateString('es', { day: 'numeric', month: 'short' })}
                                            </Typography>
                                        </div>
                                    )}
                                </div>
                                <Typography variant="h2" className="text-foreground/90">{budget.categoryName}</Typography>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-foreground/20 opacity-0 group-hover:opacity-100 group-hover:text-rose-500 bg-foreground/[0.02] hover:bg-rose-500/10 transition-all rounded-2xl p-3"
                                    onClick={() => handleDeleteBudget(budget.id)}
                                >
                                    <Trash2 size={18} />
                                </Button>
                            </div>

                            <div className="flex justify-between items-end mb-3">
                                <Typography variant="body" className="font-black text-foreground/80 tracking-tight">
                                    {formatCurrency(budget.spent)} <span className="text-foreground/30 font-medium font-mono text-sm">/ {formatCurrency(budget.amount)}</span>
                                </Typography>
                                <Typography variant="small" className={`font-black ${budget.percent >= 100 ? 'text-rose-500' : budget.percent >= 80 ? 'text-orange-500' : 'text-blue-500'}`}>
                                    {Math.round(budget.percent)}%
                                </Typography>
                            </div>

                            <div className="w-full bg-foreground/[0.03] rounded-full h-4 mb-8 overflow-hidden border border-foreground/[0.05] shadow-inner">
                                <div
                                    className={`h-full transition-all duration-1000 shadow-[0_0_10px_rgba(0,0,0,0.1)] ${budget.percent >= 100 ? 'bg-rose-500' :
                                        budget.percent >= 80 ? 'bg-orange-500' :
                                            'bg-blue-600'
                                        }`}
                                    style={{ width: `${Math.min(budget.percent, 100)}%` }}
                                />
                            </div>

                            <div className={`flex justify-between items-center p-4 rounded-2xl border transition-colors ${budget.percent >= 100 ? 'bg-rose-500/[0.03] border-rose-500/10' :
                                budget.percent >= 80 ? 'bg-orange-500/[0.03] border-orange-500/10' :
                                    'bg-emerald-500/[0.03] border-emerald-500/10'
                                }`}>
                                <div className="flex items-center space-x-3">
                                    {budget.percent >= 100 ? (
                                        <AlertCircle size={18} className="text-rose-500" />
                                    ) : budget.percent >= 80 ? (
                                        <AlertCircle size={18} className="text-orange-500" />
                                    ) : (
                                        <CheckCircle2 size={18} className="text-emerald-500" />
                                    )}
                                    <Typography variant="body" className={`font-black text-sm ${budget.percent >= 100 ? 'text-rose-600' :
                                        budget.percent >= 80 ? 'text-orange-600' :
                                            'text-emerald-600'
                                        }`}>
                                        {budget.percent >= 100 ? 'Límite Excedido' : budget.percent >= 80 ? 'Cerca del Límite' : 'Bajo control'}
                                    </Typography>
                                </div>
                                <Typography variant="body" className="font-bold text-xs opacity-60">
                                    {budget.remaining >= 0
                                        ? `${formatCurrency(budget.remaining)} restantes`
                                        : `${formatCurrency(Math.abs(budget.remaining))} excedidos`}
                                </Typography>
                            </div>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
}
