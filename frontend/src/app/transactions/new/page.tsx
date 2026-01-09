import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/ui/molecules/PageHeader';
import TransactionFormClient from './TransactionFormClient';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'

async function getData(token: string) {
    const [categoriesRes, accountsRes] = await Promise.all([
        fetch(`${API_URL}/categories/`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${API_URL}/accounts/`, { headers: { 'Authorization': `Bearer ${token}` } })
    ])

    const categories = categoriesRes.ok ? await categoriesRes.json() : []
    const accounts = accountsRes.ok ? await accountsRes.json() : []

    return { categories, accounts }
}

export default async function NewTransactionPage() {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) redirect('/login')

    const { categories, accounts } = await getData(session.access_token)

    return (
        <main className="max-w-3xl mx-auto p-4 md:p-8 space-y-8 pb-32">
            <PageHeader
                title="Nueva Transacción"
                description="Registra un nuevo movimiento en tus cuentas de forma rápida."
                backHref="/transactions"
            />

            <TransactionFormClient categories={categories} accounts={accounts} />
        </main>
    )
}
