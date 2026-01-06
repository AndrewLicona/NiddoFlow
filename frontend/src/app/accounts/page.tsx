import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import { redirect } from 'next/navigation'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'

async function getAccounts(token: string) {
    const res = await fetch(`${API_URL}/accounts/`, {
        headers: {
            'Authorization': `Bearer ${token}`
        },
        cache: 'no-store'
    })
    if (!res.ok) return []
    return res.json()
}

export default async function AccountsPage() {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) redirect('/login')

    const accounts = await getAccounts(session.access_token)

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-3xl font-bold text-gray-900">Mis Cuentas</h1>
                    <Link
                        href="/accounts/new"
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md transition-colors"
                    >
                        + Nueva Cuenta
                    </Link>
                </div>

                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {accounts.map((account: any) => (
                        <div key={account.id} className="bg-white overflow-hidden shadow rounded-lg border border-gray-100">
                            <div className="px-5 py-5">
                                <dt className="text-sm font-medium text-gray-900 truncate">
                                    {account.name}
                                </dt>
                                <dd className="mt-1 text-3xl font-semibold text-gray-900">
                                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(account.balance)}
                                </dd>
                                <div className="mt-2">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${account.type === 'personal' ? 'bg-indigo-100 text-indigo-800' : 'bg-green-100 text-green-800'
                                        }`}>
                                        {account.type === 'personal' ? 'Personal' : 'Familiar'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}

                    {accounts.length === 0 && (
                        <div className="col-span-full text-center py-12 bg-white rounded-lg border border-dashed border-gray-300">
                            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                            </svg>
                            <h3 className="mt-2 text-sm font-medium text-gray-900">No tienes cuentas</h3>
                            <p className="mt-1 text-sm text-gray-500">Comienza creando tu primera billetera o cuenta bancaria.</p>
                            <div className="mt-6">
                                <Link
                                    href="/accounts/new"
                                    className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                >
                                    Crear Cuenta
                                </Link>
                            </div>
                        </div>
                    )}
                </div>

                <div className="mt-8">
                    <Link href="/" className="text-blue-600 hover:text-blue-800 font-bold">
                        &larr; Volver al Dashboard
                    </Link>
                </div>
            </div>
        </div>
    )
}
