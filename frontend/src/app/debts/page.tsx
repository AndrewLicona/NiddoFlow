import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import DebtClient from './DebtClient';
import { PageHeader } from '@/components/ui/molecules/PageHeader';


export default async function DebtsPage() {
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

    const [debtsRes, accountsRes, categoriesRes] = await Promise.all([
        supabase.from('debts').select('*').eq('family_id', profile.family_id).order('created_at', { ascending: false }),
        supabase.from('accounts').select('*').or(`family_id.eq.${profile.family_id},user_id.eq.${session.user.id}`),
        supabase.from('categories').select('*')
    ]);

    return (
        <main className="max-w-4xl mx-auto p-4 md:p-8">
            <PageHeader
                title="Deudas y Préstamos"
                description="Gestiona tus compromisos financieros y cuentas por cobrar."
                backHref="/"
            />

            <DebtClient
                initialDebts={debtsRes.data || []}
                accounts={accountsRes.data || []}
                categories={categoriesRes.data || []}
                token={session.access_token}
            />
        </main>
    );
}
