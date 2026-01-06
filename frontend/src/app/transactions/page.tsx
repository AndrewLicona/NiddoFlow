import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import TransactionList from './TransactionList'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'

async function getTransactions(token: string) {
    const res = await fetch(`${API_URL}/transactions/`, {
        headers: {
            'Authorization': `Bearer ${token}`
        },
        cache: 'no-store' // Always fetch fresh
    })
    if (!res.ok) return []
    return res.json()
}

export default async function TransactionsPage() {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
        redirect('/login')
    }

    const transactions = await getTransactions(session.access_token)

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-4xl mx-auto">
                <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-8 space-y-4 md:space-y-0">
                    <div className="flex items-center space-x-4">
                        <Link href="/" className="p-2 rounded-full hover:bg-white shadow-sm transition-all text-blue-600">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900">Historial</h1>
                            <p className="text-sm text-gray-500">Todas tus transacciones y movimientos.</p>
                        </div>
                    </div>

                    <Link
                        href="/transactions/new"
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-xl shadow-lg shadow-blue-200 transition-all text-center"
                    >
                        + Nueva Transacción
                    </Link>
                </div>

                <TransactionList transactions={transactions} />
            </div>
        </div>
    )
}
