'use client';

import React, { useMemo, useState } from 'react';
import { Card } from '@/components/ui/molecules/Card';
import { Typography } from '@/components/ui/atoms/Typography';
import { Button } from '@/components/ui/atoms/Button';
import { InputField } from '@/components/ui/molecules/InputField';
import { useGoals } from '@/hooks/useGoals';
import { useAccounts } from '@/hooks/useAccounts';
import { useCategories } from '@/hooks/useCategories';
import { formatCurrency } from '@/utils/format';
import type { SavingsGoal } from '@/lib/api/goals.api';
import {
    CalendarClock,
    Loader2,
    PiggyBank,
    Plus,
    Target,
    Trash2,
    TrendingUp,
    Wallet,
} from 'lucide-react';

/** Convierte "1.000.000" o "1000000" en número. */
const parseAmount = (value: string): number => Number(value.replace(/[^\d]/g, '')) || 0;

/** Formatea una fecha "YYYY-MM-DD" sin desfase de zona horaria. */
const formatDate = (value: string | null | undefined): string | null => {
    if (!value) return null;
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day).toLocaleDateString('es-CO', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
};

const daysUntil = (value: string | null | undefined): number | null => {
    if (!value) return null;
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return null;
    const target = new Date(year, month - 1, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - today.getTime()) / 86400000);
};

export default function GoalsClient() {
    const { goals, isLoading, error, isError, createGoal, deleteGoal, contribute } = useGoals();
    const { accounts } = useAccounts();
    const { categories } = useCategories();

    const [name, setName] = useState('');
    const [amount, setAmount] = useState('');
    const [targetDate, setTargetDate] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [formError, setFormError] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const [activeGoalId, setActiveGoalId] = useState<string | null>(null);
    const [contributionAmount, setContributionAmount] = useState('');
    const [contributionAccount, setContributionAccount] = useState('');
    const [contributionError, setContributionError] = useState('');

    const expenseCategories = useMemo(
        () => categories.filter((c) => c.type === 'expense'),
        [categories]
    );

    const totals = useMemo(() => {
        const saved = goals.reduce((acc, goal) => acc + Number(goal.saved_amount || 0), 0);
        const target = goals.reduce((acc, goal) => acc + Number(goal.target_amount || 0), 0);
        return { saved, target, remaining: Math.max(0, target - saved) };
    }, [goals]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();

        const trimmedName = name.trim();
        const targetAmount = parseAmount(amount);

        if (!trimmedName) {
            setFormError('Ponle un nombre a la meta.');
            return;
        }
        if (targetAmount <= 0) {
            setFormError('Indica cuánto quieres ahorrar.');
            return;
        }

        setFormError('');
        setIsSaving(true);
        try {
            await createGoal.mutateAsync({
                name: trimmedName,
                target_amount: targetAmount,
                target_date: targetDate || null,
                category_id: categoryId || null,
            });
            setName('');
            setAmount('');
            setTargetDate('');
            setCategoryId('');
        } catch (err) {
            setFormError(err instanceof Error ? err.message : 'No se pudo crear la meta.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleContribute = async (goal: SavingsGoal) => {
        const contribution = parseAmount(contributionAmount);

        if (contribution <= 0) {
            setContributionError('Escribe el monto del aporte.');
            return;
        }

        setContributionError('');
        try {
            await contribute.mutateAsync({
                id: goal.id,
                data: {
                    amount: contribution,
                    account_id: contributionAccount || null,
                },
            });
            setContributionAmount('');
            setActiveGoalId(null);
        } catch (err) {
            setContributionError(err instanceof Error ? err.message : 'No se pudo registrar el aporte.');
        }
    };

    const handleDelete = async (goal: SavingsGoal) => {
        if (!window.confirm(`¿Eliminar la meta "${goal.name}"?`)) return;
        try {
            await deleteGoal.mutateAsync(goal.id);
        } catch {
            // El error se refleja en el estado de la lista al invalidar la caché.
        }
    };

    return (
        <div className="space-y-6 md:space-y-8">
            {/* Resumen */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-6">
                <Card variant="elevated" className="relative overflow-hidden group border-emerald-500/10">
                    <div className="absolute top-0 right-0 p-4 text-emerald-500 opacity-10 group-hover:opacity-20 transition-opacity">
                        <PiggyBank size={64} strokeWidth={1.5} />
                    </div>
                    <Typography variant="small" className="text-foreground font-black uppercase tracking-widest text-[9px] opacity-70">
                        Total ahorrado
                    </Typography>
                    <Typography variant="h2" className="mt-1 tracking-tighter text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(totals.saved)}
                    </Typography>
                </Card>

                <Card variant="elevated" className="relative overflow-hidden group border-blue-500/10">
                    <div className="absolute top-0 right-0 p-4 text-blue-500 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Target size={64} strokeWidth={1.5} />
                    </div>
                    <Typography variant="small" className="text-foreground font-black uppercase tracking-widest text-[9px] opacity-70">
                        Objetivo total
                    </Typography>
                    <Typography variant="h2" className="mt-1 tracking-tighter text-blue-600 dark:text-blue-400">
                        {formatCurrency(totals.target)}
                    </Typography>
                </Card>

                <Card variant="elevated" className="relative overflow-hidden group border-amber-500/10">
                    <div className="absolute top-0 right-0 p-4 text-amber-500 opacity-10 group-hover:opacity-20 transition-opacity">
                        <TrendingUp size={64} strokeWidth={1.5} />
                    </div>
                    <Typography variant="small" className="text-foreground font-black uppercase tracking-widest text-[9px] opacity-70">
                        Falta ahorrar
                    </Typography>
                    <Typography variant="h2" className="mt-1 tracking-tighter text-amber-600 dark:text-amber-400">
                        {formatCurrency(totals.remaining)}
                    </Typography>
                </Card>
            </div>

            {/* Nueva meta */}
            <Card variant="elevated" className="space-y-4">
                <div className="flex items-center gap-2">
                    <Plus size={18} className="text-blue-500" />
                    <Typography variant="h3" className="text-foreground font-black">Nueva meta</Typography>
                </div>

                <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                    <InputField
                        label="Nombre de la meta"
                        placeholder="Vacaciones, entrada del apartamento..."
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                    <InputField
                        label="Objetivo (COP)"
                        type="number"
                        min={0}
                        placeholder="2000000"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                    />
                    <InputField
                        label="Fecha objetivo"
                        type="date"
                        value={targetDate}
                        onChange={(e) => setTargetDate(e.target.value)}
                    />
                    <InputField
                        as="select"
                        label="Categoría (opcional)"
                        value={categoryId}
                        onChange={(e) => setCategoryId(e.target.value)}
                    >
                        <option value="">Sin categoría</option>
                        {expenseCategories.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.name}
                            </option>
                        ))}
                    </InputField>

                    {formError && (
                        <Typography variant="muted" className="text-rose-500 md:col-span-2">
                            {formError}
                        </Typography>
                    )}

                    <div className="md:col-span-2">
                        <Button type="submit" isLoading={isSaving} className="w-full md:w-auto">
                            Crear meta
                        </Button>
                    </div>
                </form>
            </Card>

            {/* Lista de metas */}
            {isLoading ? (
                <Card variant="elevated" className="flex items-center justify-center min-h-[160px]">
                    <Loader2 className="animate-spin text-indigo-600" size={28} />
                </Card>
            ) : isError ? (
                <Card variant="elevated" className="flex items-center gap-3 border-amber-500/30">
                    <Typography variant="body" className="text-amber-600 dark:text-amber-400 font-bold">
                        {error instanceof Error
                            ? error.message
                            : 'No pudimos cargar tus metas en este momento.'}
                    </Typography>
                </Card>
            ) : goals.length === 0 ? (
                <Card variant="elevated" className="flex flex-col items-center justify-center text-center gap-3 py-10">
                    <div className="p-4 bg-foreground/[0.03] rounded-full text-foreground/20">
                        <Target size={32} />
                    </div>
                    <Typography variant="h3" className="text-foreground/70 font-black">
                        Todavía no tienes metas
                    </Typography>
                    <Typography variant="muted" className="text-foreground/40 max-w-sm">
                        Crea tu primera meta de ahorro y marca cuánto llevas en ella.
                    </Typography>
                </Card>
            ) : (
                <div className="space-y-4">
                    {goals.map((goal) => {
                        const target = Number(goal.target_amount || 0);
                        const saved = Number(goal.saved_amount || 0);
                        const percent = target > 0 ? (saved / target) * 100 : 0;
                        const isComplete = target > 0 && saved >= target;
                        const remaining = Math.max(0, target - saved);
                        const formattedDate = formatDate(goal.target_date);
                        const days = daysUntil(goal.target_date);
                        const isOpen = activeGoalId === goal.id;

                        return (
                            <Card key={goal.id} variant="elevated" className="space-y-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <Typography variant="h3" className="text-foreground font-black truncate">
                                            {goal.name}
                                        </Typography>
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                                            {formattedDate && (
                                                <span className="flex items-center gap-1 text-[10px] opacity-50 uppercase font-black tracking-widest">
                                                    <CalendarClock size={12} />
                                                    {formattedDate}
                                                    {days !== null && (
                                                        <span className={days < 0 ? 'text-rose-500' : ''}>
                                                            {days < 0
                                                                ? ' · vencida'
                                                                : days === 0
                                                                    ? ' · hoy'
                                                                    : ` · faltan ${days} días`}
                                                        </span>
                                                    )}
                                                </span>
                                            )}
                                            {goal.category && (
                                                <span className="text-[10px] opacity-50 uppercase font-black tracking-widest">
                                                    {goal.category}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => handleDelete(goal)}
                                        title="Eliminar meta"
                                        className="p-2 rounded-xl text-foreground/30 hover:text-rose-500 hover:bg-rose-500/10 transition-colors shrink-0"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex justify-between items-end">
                                        <Typography variant="body" className="font-mono font-bold text-foreground">
                                            {formatCurrency(saved)}
                                            <span className="opacity-40 font-normal">
                                                {' '}/ {formatCurrency(target)}
                                            </span>
                                        </Typography>
                                        <Typography variant="small" className="font-black uppercase tracking-widest text-[9px] opacity-60">
                                            {Math.round(percent)}%
                                        </Typography>
                                    </div>
                                    <div className="h-2 w-full bg-foreground/[0.05] rounded-full overflow-hidden">
                                        <div
                                            className={`h-full transition-all duration-1000 ${isComplete ? 'bg-emerald-500' : 'bg-blue-500'}`}
                                            style={{ width: `${Math.min(100, percent)}%` }}
                                        />
                                    </div>
                                    <Typography variant="small" className="text-[9px] uppercase font-black tracking-widest opacity-40">
                                        {isComplete
                                            ? '¡Meta alcanzada! Sigue así.'
                                            : `Te falta ${formatCurrency(remaining)}`}
                                    </Typography>
                                </div>

                                {isOpen ? (
                                    <div className="p-4 rounded-2xl bg-foreground/[0.02] border border-foreground/[0.05] space-y-3">
                                        <InputField
                                            label="Monto del aporte"
                                            type="number"
                                            min={0}
                                            placeholder="200000"
                                            value={contributionAmount}
                                            onChange={(e) => setContributionAmount(e.target.value)}
                                        />
                                        {accounts.length > 0 && (
                                            <InputField
                                                as="select"
                                                label="Cuenta (opcional)"
                                                value={contributionAccount}
                                                onChange={(e) => setContributionAccount(e.target.value)}
                                            >
                                                <option value="">Sin cuenta</option>
                                                {accounts.map((acc: any) => (
                                                    <option key={acc.id} value={acc.id}>
                                                        {acc.name}
                                                    </option>
                                                ))}
                                            </InputField>
                                        )}

                                        {contributionError && (
                                            <Typography variant="muted" className="text-rose-500">
                                                {contributionError}
                                            </Typography>
                                        )}

                                        <div className="flex gap-2">
                                            <Button
                                                type="button"
                                                size="sm"
                                                onClick={() => handleContribute(goal)}
                                                isLoading={contribute.isPending}
                                            >
                                                Guardar aporte
                                            </Button>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => {
                                                    setActiveGoalId(null);
                                                    setContributionError('');
                                                }}
                                            >
                                                Cancelar
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex justify-end">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                                setActiveGoalId(goal.id);
                                                setContributionAmount('');
                                                setContributionError('');
                                            }}
                                            className="flex items-center gap-2"
                                        >
                                            <Wallet size={16} />
                                            Aportar
                                        </Button>
                                    </div>
                                )}
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
