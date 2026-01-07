import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import TransactionList from './TransactionList'
import { PageHeader } from '@/components/ui/molecules/PageHeader';
import { Button } from '@/components/ui/atoms/Button';
import { Plus } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'

async function getData(token: string) {
    const [txRes, catRes, accRes] = await Promise.all([
        fetch(`${API_URL}/transactions/`, { headers: { 'Authorization': `Bearer ${token}` }, cache: 'no-store' }),
        fetch(`${API_URL}/categories/`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${API_URL}/accounts/`, { headers: { 'Authorization': `Bearer ${token}` } })
    ])

    return {
        transactions: txRes.ok ? await txRes.json() : [],
        categories: catRes.ok ? await catRes.json() : [],
        accounts: accRes.ok ? await accRes.json() : []
    }
}

export default async function TransactionsPage() {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) redirect('/login')

    const { transactions, categories, accounts } = await getData(session.access_token)

    return (
        <main className="max-w-4xl mx-auto p-4 md:p-8 pb-32">
            <PageHeader
                title="Historial"
                description="Todas tus transacciones y movimientos."
                backHref="/"
                actions={
                    <Link href="/transactions/new">
                        <Button size="sm">
                            <Plus size={16} className="mr-2" />
                            Nueva Transacción
                        </Button>
                    </Link>
                }
            />

            <TransactionList
                transactions={transactions}
                categories={categories}
                accounts={accounts}
            />
        </main>
    )
}
