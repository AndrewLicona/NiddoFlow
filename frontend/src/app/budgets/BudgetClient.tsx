// src/app/budgets/BudgetClient.tsx
'use client';

import React, { useState, useMemo } from 'react';
import { formatCurrency } from '@/utils/format';
import { Typography } from '@/components/ui/atoms/Typography';
import { Button } from '@/components/ui/atoms/Button';
import { Card } from '@/components/ui/molecules/Card';
import { InputField } from '@/components/ui/molecules/InputField';
import { Plus, Target, Trash2, AlertCircle, CheckCircle2, Calendar, Save } from 'lucide-react';
import { getWeekNumber, getStartOfWeek } from '@/utils/date';
import { useBudgets } from '@/hooks/useBudgets';
import { useCategories } from '@/hooks/useCategories';
import { useTransactions } from '@/hooks/useTransactions';
import { useDashboard } from '@/hooks/useDashboard';
import { Loader2 } from 'lucide-react';

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
    user_id: string | null;
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
    user_id?: string;
}

export default function BudgetClient({ userId }: { userId: string }) {
    const { budgets, isLoading: budgetsLoading, createBudget: createBudgetMutation, deleteBudget: deleteBudgetMutation } = useBudgets();
    const { categories, isLoading: categoriesLoading } = useCategories();

    const today = useMemo(() => new Date(), []);
    const startOfMonth = useMemo(() => new Date(today.getFullYear(), today.getMonth(), 1).toISOString(), [today]);
    const endOfMonth = useMemo(() => new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999).toISOString(), [today]);

    const { transactions, isLoading: txLoading } = useTransactions({
        start_date: startOfMonth,
        end_date: endOfMonth
    });
    const [isCreating, setIsCreating] = useState(false);
    const [scopeFilter, setScopeFilter] = useState<'all' | 'personal' | 'family'>('all');
    const [newBudget, setNewBudget] = useState({
        category_id: '',
        amount: '',
        period: 'monthly' as 'weekly' | 'biweekly' | 'monthly' | 'custom',
        month: 1, // Default, will be updated in useEffect
        week_number: 1,
        year: 2024,
        start_date: '',
        end_date: '',
        scope: 'family' as 'family' | 'personal'
    });

    // Initialize date-dependent state on client only to avoid hydration mismatch
    React.useEffect(() => {
        const now = new Date();
        setNewBudget(prev => ({
            ...prev,
            month: now.getMonth() + 1,
            week_number: getWeekNumber(now),
            year: now.getFullYear()
        }));
    }, []);

    const calculateDates = (period: string, month: number, year: number) => {
        if (period === 'custom') return {};

        let start = new Date(year, month - 1, 1);
        let end = new Date(year, month, 0);

        if (period === 'biweekly') {
            const today = new Date();
            const isSecondHalf = today.getMonth() + 1 === month && today.getDate() > 15;

            if (isSecondHalf) {
                start = new Date(year, month - 1, 16);
                end = new Date(year, month, 0);
            } else {
                start = new Date(year, month - 1, 1);
                end = new Date(year, month - 1, 15);
            }
        }

        return {
            start_date: start.toISOString().split('T')[0],
            end_date: end.toISOString().split('T')[0]
        };
    };

    const handleBudgetChange = (updates: Partial<typeof newBudget>) => {
        setNewBudget(prev => {
            const updated = { ...prev, ...updates };
            if (updates.period || updates.month || updates.year) {
                const dates = calculateDates(updated.period, updated.month, updated.year);
                return { ...updated, ...dates };
            }
            return updated;
        });
    };

    const expenseCategories = useMemo(() =>
        categories.filter((c: any) => c.type === 'expense'),
        [categories]);

    const filteredBudgets = useMemo(() => {
        return budgets.filter((b: any) => {
            if (scopeFilter === 'all') return true;
            if (scopeFilter === 'personal') return b.user_id === userId;
            if (scopeFilter === 'family') return !b.user_id;
            return true;
        });
    }, [budgets, scopeFilter, userId]);

    const budgetStats = useMemo(() => {
        const currentWeekNumber = getWeekNumber(new Date());

        return filteredBudgets.map((budget: any) => {
            const category = categories.find((c: any) => c.id === budget.category_id);

            let relevantTxs = transactions.filter((t: any) =>
                t.type === 'expense' &&
                t.category_id === budget.category_id
            );

            // Strict Personal vs Family Filter
            if (budget.user_id) {
                // Personal Budget: Only count my own transactions
                relevantTxs = relevantTxs.filter((t: any) => t.user_id === budget.user_id);
            } else {
                // Family Budget: Count everyone's transactions (Global)
                // (Already includes everyone because 'transactions' prop has family scope)
            }

            if (budget.start_date && budget.end_date) {
                const start = new Date(budget.start_date);
                const end = new Date(budget.end_date);
                end.setHours(23, 59, 59, 999);

                relevantTxs = relevantTxs.filter((t: any) => {
                    const txDate = new Date(t.date);
                    return txDate >= start && txDate <= end;
                });
            } else if (budget.period === 'weekly') {
                const startOfWeek = getStartOfWeek(budget.week_number || currentWeekNumber, budget.year);
                const endOfWeek = new Date(startOfWeek);
                endOfWeek.setDate(startOfWeek.getDate() + 6);
                endOfWeek.setHours(23, 59, 59, 999);

                relevantTxs = relevantTxs.filter((t: any) => {
                    const txDate = new Date(t.date);
                    return txDate >= startOfWeek && txDate <= endOfWeek;
                });
            } else {
                relevantTxs = relevantTxs.filter((t: any) => {
                    const txDate = new Date(t.date);
                    return txDate.getMonth() + 1 === budget.month &&
                        txDate.getFullYear() === budget.year;
                });
            }

            const spent = relevantTxs.reduce((acc: number, t: any) => acc + t.amount, 0);
            const percent = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;

            return {
                ...budget,
                categoryName: category?.name || 'General',
                spent,
                percent,
                remaining: budget.amount - spent
            };
        });
    }, [filteredBudgets, categories, transactions]);

    const handleCreateBudget = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);

        const data = {
            category_id: formData.get('category_id') as string,
            amount: Number(formData.get('amount')),
            period: formData.get('period') as any,
            month: Number(formData.get('month')),
            year: Number(formData.get('year')),
            start_date: formData.get('start_date') as string,
            end_date: formData.get('end_date') as string,
            user_id: formData.get('user_id') === 'null' ? null : formData.get('user_id') as string,
        };

        try {
            await createBudgetMutation.mutateAsync(data);
            setIsCreating(false);
            setNewBudget({
                category_id: '',
                amount: '',
                period: 'monthly',
                month: new Date().getMonth() + 1,
                week_number: getWeekNumber(new Date()),
                year: new Date().getFullYear(),
                start_date: '',
                end_date: '',
                scope: 'family'
            });
        } catch (error) {
            console.error('Error creating budget:', error);
        }
    };

    const handleDeleteBudget = async (id: string) => {
        if (!confirm('¿Estás seguro de eliminar este presupuesto?')) return;
        try {
            await deleteBudgetMutation.mutateAsync(id);
        } catch (error) {
            console.error('Error deleting budget:', error);
        }
    };

    if (budgetsLoading || categoriesLoading || txLoading) {
        return (
            <div className="flex items-center justify-center py-24">
                <Loader2 className="animate-spin text-blue-600" size={40} />
            </div>
        );
    }

    return (
        <div className="space-y-8 pb-24 min-h-screen">
            <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
                <div className="w-full md:w-auto overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
                    <div className="flex space-x-2 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl w-max md:w-auto mx-auto md:mx-0">
                        <button
                            onClick={() => setScopeFilter('all')}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border border-transparent whitespace-nowrap active:scale-95 ${scopeFilter === 'all' ? 'bg-white dark:bg-slate-700 shadow-md text-indigo-600 border-slate-200 dark:border-slate-600' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}
                        >
                            Todos
                        </button>
                        <button
                            onClick={() => setScopeFilter('family')}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border border-transparent whitespace-nowrap active:scale-95 ${scopeFilter === 'family' ? 'bg-white dark:bg-slate-700 shadow-md text-indigo-600 border-slate-200 dark:border-slate-600' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}
                        >
                            Familiar
                        </button>
                        <button
                            onClick={() => setScopeFilter('personal')}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border border-transparent whitespace-nowrap active:scale-95 ${scopeFilter === 'personal' ? 'bg-white dark:bg-slate-700 shadow-md text-cyan-600 border-slate-200 dark:border-slate-600' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}
                        >
                            Personal
                        </button>
                    </div>
                </div>

                <Button
                    onClick={() => setIsCreating(true)}
                    variant={isCreating ? 'ghost' : 'primary'}
                    className={`${isCreating ? 'hidden' : ''} shadow-xl shadow-indigo-500/20`}
                >
                    <Plus size={18} className="md:mr-2" />
                    <span className="hidden md:inline">Nuevo Presupuesto</span>
                    <span className="md:hidden">Nuevo</span>
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
                        {/* Hidden inputs for non-standard form fields */}
                        <input type="hidden" name="user_id" value={newBudget.scope === 'personal' ? userId : 'null'} />
                        <div className="md:col-span-2 flex justify-center pb-4">
                            <div className="inline-flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-xl w-full md:w-auto">
                                <button
                                    type="button"
                                    onClick={() => handleBudgetChange({ scope: 'family' })}
                                    className={`flex-1 md:flex-none px-6 py-3 rounded-lg text-sm font-bold transition-all border border-transparent ${newBudget.scope === 'family' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm border-slate-200 dark:border-slate-600' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                                >
                                    Familiar (Global)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleBudgetChange({ scope: 'personal' })}
                                    className={`flex-1 md:flex-none px-6 py-3 rounded-lg text-sm font-bold transition-all border border-transparent ${newBudget.scope === 'personal' ? 'bg-white dark:bg-slate-700 text-cyan-600 shadow-sm border-slate-200 dark:border-slate-600' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                                >
                                    Personal (Solo yo)
                                </button>
                            </div>
                        </div>

                        <InputField
                            label="Categoría"
                            as="select"
                            value={newBudget.category_id}
                            name="category_id"
                            onChange={(e) => setNewBudget({ ...newBudget, category_id: e.target.value })}
                        >
                            <option value="">Selecciona una categoría</option>
                            {expenseCategories.map((cat: any) => (
                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                            ))}
                        </InputField>
                        <InputField
                            label="Monto Máximo"
                            type="number"
                            placeholder="0.00"
                            value={newBudget.amount}
                            name="amount"
                            onChange={(e) => setNewBudget({ ...newBudget, amount: e.target.value })}
                            required
                        />
                        <InputField
                            label="Frecuencia"
                            as="select"
                            value={newBudget.period}
                            name="period"
                            onChange={(e) => handleBudgetChange({ period: e.target.value as 'weekly' | 'biweekly' | 'monthly' | 'custom' })}
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
                            name="month"
                            onChange={(e) => handleBudgetChange({ month: parseInt(e.target.value) })}
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
                            name="year"
                            onChange={(e) => handleBudgetChange({ year: parseInt(e.target.value) })}
                        />

                        <div className="md:col-span-1">
                            <InputField
                                label="Fecha Inicio"
                                type="date"
                                value={newBudget.start_date}
                                name="start_date"
                                onChange={(e) => setNewBudget({ ...newBudget, start_date: e.target.value })}
                                required
                            />
                        </div>
                        <div className="md:col-span-1">
                            <InputField
                                label="Fecha Fin"
                                type="date"
                                value={newBudget.end_date}
                                name="end_date"
                                onChange={(e) => setNewBudget({ ...newBudget, end_date: e.target.value })}
                                required
                            />
                        </div>

                        <div className="flex justify-end space-x-4 md:col-span-2 pt-4">
                            <Button type="button" variant="ghost" onClick={() => setIsCreating(false)} className="text-foreground/40 hover:text-foreground">
                                Cancelar
                            </Button>
                            <Button type="submit" isLoading={createBudgetMutation.isPending} className="shadow-lg shadow-blue-500/20 px-8">
                                <Save size={18} className="mr-2" />
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
                    budgetStats.map((budget: any) => (
                        <Card key={budget.id} variant="elevated" className="group hover:scale-[1.005] transition-all duration-300">
                            <div className="flex flex-col md:flex-row md:justify-between items-start md:items-center gap-4 mb-4 md:mb-8">
                                <div className="flex flex-col space-y-2 order-2 md:order-1">
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
                                        <div className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest ${budget.user_id ? 'bg-cyan-500/10 text-cyan-600' : 'bg-foreground/5 text-foreground/40'}`}>
                                            {budget.user_id ? 'Personal' : 'Familiar'}
                                        </div>
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
                                <div className="flex justify-between items-start w-full md:w-auto order-1 md:order-2 md:contents">
                                    <Typography variant="h3" className="text-foreground/90 md:text-2xl font-black truncate max-w-[200px] md:max-w-none">
                                        {budget.categoryName}
                                    </Typography>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-foreground/20 opacity-100 md:opacity-0 group-hover:opacity-100 group-hover:text-rose-500 bg-foreground/[0.02] hover:bg-rose-500/10 transition-all rounded-2xl p-2 md:p-3"
                                        isLoading={deleteBudgetMutation.isPending}
                                        onClick={() => handleDeleteBudget(budget.id)}
                                    >
                                        <Trash2 size={18} />
                                    </Button>
                                </div>
                            </div>

                            <div className="flex justify-between items-end mb-3">
                                <Typography variant="body" className="font-black text-foreground/80 tracking-tight">
                                    {formatCurrency(budget.spent)} <span className="text-foreground/30 font-medium font-mono text-sm">/ {formatCurrency(budget.amount)}</span>
                                </Typography>
                                <Typography variant="small" className={`font-black ${budget.percent >= 100 ? 'text-rose-500' : budget.percent >= 80 ? 'text-orange-500' : 'text-blue-500'}`}>
                                    {Math.round(budget.percent)}%
                                </Typography>
                            </div>

                            <div className="w-full bg-foreground/[0.03] rounded-full h-3 md:h-4 mb-4 md:mb-8 overflow-hidden border border-foreground/[0.05] shadow-inner">
                                <div
                                    className={`h-full transition-all duration-1000 shadow-[0_0_10px_rgba(0,0,0,0.1)] ${budget.percent >= 100 ? 'bg-rose-500' :
                                        budget.percent >= 80 ? 'bg-orange-500' :
                                            'bg-blue-600'
                                        }`}
                                    style={{ width: `${Math.min(budget.percent, 100)}%` }}
                                />
                            </div>

                            <div className={`flex justify-between items-center p-3 md:p-4 rounded-2xl border transition-colors ${budget.percent >= 100 ? 'bg-rose-500/[0.03] border-rose-500/10' :
                                budget.percent >= 80 ? 'bg-orange-500/[0.03] border-orange-500/10' :
                                    'bg-emerald-500/[0.03] border-emerald-500/10'
                                }`}>
                                <div className="flex items-center space-x-2 md:space-x-3">
                                    {budget.percent >= 100 ? (
                                        <AlertCircle size={16} className="text-rose-500 md:w-[18px] md:h-[18px]" />
                                    ) : budget.percent >= 80 ? (
                                        <AlertCircle size={16} className="text-orange-500 md:w-[18px] md:h-[18px]" />
                                    ) : (
                                        <CheckCircle2 size={16} className="text-emerald-500 md:w-[18px] md:h-[18px]" />
                                    )}
                                    <Typography variant="body" className={`font-black text-xs md:text-sm ${budget.percent >= 100 ? 'text-rose-600' :
                                        budget.percent >= 80 ? 'text-orange-600' :
                                            'text-emerald-600'
                                        }`}>
                                        {budget.percent >= 100 ? 'Excedido' : budget.percent >= 80 ? 'Cerca' : 'Bien'}
                                    </Typography>
                                </div>
                                <Typography variant="body" className="font-bold text-[10px] md:text-xs opacity-60">
                                    {budget.remaining >= 0
                                        ? `${formatCurrency(budget.remaining)}`
                                        : `${formatCurrency(Math.abs(budget.remaining))}`}
                                </Typography>
                            </div>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
}
