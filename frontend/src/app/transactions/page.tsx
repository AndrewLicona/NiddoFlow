import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import { redirect } from 'next/navigation'

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
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-3xl font-bold text-gray-900">Transacciones</h1>
                    <Link
                        href="/transactions/new"
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md transition-colors"
                    >
                        + Nueva Transacción
                    </Link>
                </div>

                <div className="bg-white shadow overflow-hidden sm:rounded-md">
                    <ul className="divide-y divide-gray-200">
                        {transactions.length === 0 ? (
                            <li className="px-4 py-8 text-center text-gray-800 font-medium">
                                No hay transacciones registradas aún.
                            </li>
                        ) : (
                            transactions.map((t: any) => (
                                <li key={t.id} className="px-4 py-4 sm:px-6 hover:bg-gray-50">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center">
                                            <div className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center ${t.type === 'income' ? 'bg-green-100 text-green-600' :
                                                t.type === 'expense' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
                                                }`}>
                                                {/* Simple Icon based on type */}
                                                {t.type === 'income' ? '+' : t.type === 'expense' ? '-' : '='}
                                            </div>
                                            <div className="ml-4">
                                                <p className="text-sm font-bold text-gray-900">{t.description}</p>
                                                <p className="text-sm text-gray-600 font-medium">{new Date(t.date).toLocaleDateString()}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className={`text-sm font-bold ${t.type === 'income' ? 'text-green-600' :
                                                t.type === 'expense' ? 'text-red-600' : 'text-gray-900'
                                                }`}>
                                                {t.type === 'expense' ? '-' : '+'}{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(t.amount)}
                                            </p>
                                        </div>
                                    </div>
                                </li>
                            ))
                        )}
                    </ul>
                </div>

                <div className="mt-8">
                    <Link href="/" className="text-blue-600 hover:text-blue-500 font-medium">
                        &larr; Volver al Dashboard
                    </Link>
                </div>
            </div>
        </div>
    )
}
