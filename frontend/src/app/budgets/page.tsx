// src/app/budgets/page.tsx
import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import BudgetClient from './BudgetClient';



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
        supabase.from('budgets')
            .select('*, categories(name)')
            .eq('family_id', profile.family_id)
            .eq('year', currentYear)
            .or(`user_id.is.null,user_id.eq.${session.user.id}`),
        supabase.from('categories').select('*'),
        supabase.from('transactions').select('id, amount, type, category_id, date, user_id').eq('family_id', profile.family_id).gte('date', startOfMonth).lte('date', endOfMonth)
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
                userId={session.user.id}
            />
        </main>
    );
}
