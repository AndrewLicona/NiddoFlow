// src/app/budgets/page.tsx
import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import BudgetClient from './BudgetClient';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

async function getBudgets(token: string) {
    const res = await fetch(`${API_URL}/budgets/`, {
        headers: {
            'Authorization': `Bearer ${token}`
        },
        cache: 'no-store'
    });
    if (!res.ok) return [];
    return res.json();
}

async function getCategories(token: string) {
    const res = await fetch(`${API_URL}/categories/`, {
        headers: {
            'Authorization': `Bearer ${token}`
        },
        cache: 'no-store'
    });
    if (!res.ok) return [];
    return res.json();
}

async function getTransactions(token: string) {
    const res = await fetch(`${API_URL}/transactions/`, {
        headers: {
            'Authorization': `Bearer ${token}`
        },
        cache: 'no-store'
    });
    if (!res.ok) return [];
    return res.json();
}

import { PageHeader } from '@/components/ui/molecules/PageHeader';

export default async function BudgetsPage() {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
        redirect('/login');
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('family_id')
        .eq('id', session.user.id)
        .single();

    if (!profile?.family_id) {
        redirect('/onboarding');
    }

    const today = new Date()
    const currentYear = today.getFullYear()
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString()
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999).toISOString()

    const [budgetsRes, categoriesRes, transactionsRes] = await Promise.all([
        supabase.from('budgets').select('*, categories(name)').eq('family_id', profile.family_id).eq('year', currentYear),
        supabase.from('categories').select('*'),
        supabase.from('transactions').select('id, amount, type, category_id, date').eq('family_id', profile.family_id).gte('date', startOfMonth).lte('date', endOfMonth)
    ]);

    return (
        <main className="max-w-4xl mx-auto p-4 md:p-8 space-y-8 min-h-screen pb-24">
            <PageHeader
                title="Presupuestos"
                description="Controla tus gastos por categoría (Semanales y Mensuales)."
                backHref="/"
            />

            <BudgetClient
                initialBudgets={budgetsRes.data || []}
                categories={categoriesRes.data || []}
                transactions={transactionsRes.data || []}
                token={session.access_token}
            />
        </main>
    );
}
