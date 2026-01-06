// @ts-nocheck
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { signout } from './login/actions'
import DashboardCharts from './dashboard/DashboardCharts'


const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount)
}

export default async function DashboardPage() {
    const supabase = await createClient()

    // 1. Auth Check
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    // 2. Profile & Family Check
    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

    if (!profile?.family_id) redirect('/onboarding')

    // 3. Fetch Data in Parallel
    const today = new Date()
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString()
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999).toISOString()

    const [accountsRes, recentTxRes, monthlyStatsRes] = await Promise.all([
        // Accounts: Personal (mine) + Joint (family)
        supabase.from('accounts').select('*').or(`family_id.eq.${profile.family_id},user_id.eq.${user.id}`),
        // Recent Transactions: Last 5
        supabase.from('transactions').select('*, categories(name, icon)').eq('family_id', profile.family_id).order('date', { ascending: false }).limit(5),
        // Monthly Stats: All txs this month
        supabase.from('transactions').select('amount, type, categories(name)').eq('family_id', profile.family_id).gte('date', startOfMonth).lte('date', endOfMonth)
    ])

    // 4. Process Accounts Data
    const allAccounts = accountsRes.data || []
    const myAccounts = allAccounts.filter(acc =>
        acc.family_id === profile.family_id &&
        (acc.type === 'joint' || (acc.type === 'personal' && acc.user_id === user.id))
    )
    const totalBalance = myAccounts.reduce((acc: number, curr: any) => acc + Number(curr.balance), 0)

    // 5. Process Monthly Stats
    const monthlyTxs = monthlyStatsRes.data || []
    const income = monthlyTxs.filter(t => t.type === 'income').reduce((acc, curr) => acc + Number(curr.amount), 0)
    const expense = monthlyTxs.filter(t => t.type === 'expense').reduce((acc, curr) => acc + Number(curr.amount), 0)

    // Aggregate Expenses by Category
    const expensesByCategory: Record<string, number> = {}
    monthlyTxs
        .filter(t => t.type === 'expense')
        .forEach((t: any) => {
            const catName = t.categories?.name || 'Varios'
            expensesByCategory[catName] = (expensesByCategory[catName] || 0) + Number(t.amount)
        })

    const chartData = Object.entries(expensesByCategory).map(([name, value], index) => ({
        name,
        value,
        color: '' // Handled by component color logic
    }))

    // 6. Components
    const displayName = user.user_metadata?.full_name || profile.full_name || user.email

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            {/* Header / Banner */}
            <div className="bg-blue-600 pt-8 pb-16 px-4">
                <div className="max-w-4xl mx-auto flex justify-between items-center text-white">
                    <div>
                        <p className="text-blue-100 text-sm font-medium uppercase tracking-wider">Dashboard</p>
                        <h1 className="text-3xl font-bold mt-1">Hola, {displayName?.split(' ')[0]}</h1>
                    </div>
                    <form action={signout}>
                        <button className="text-blue-200 hover:text-white text-sm bg-blue-700 hover:bg-blue-600 py-2 px-3 rounded transition-colors">
                            Salir
                        </button>
                    </form>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-4 -mt-10">
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Total Balance */}
                    <div className="bg-white rounded-xl shadow-lg p-6 flex flex-col justify-between h-32 border-l-4 border-blue-500">
                        <p className="text-gray-500 font-medium text-sm uppercase">Balance Total</p>
                        <p className={`text-3xl font-bold ${totalBalance >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                            {formatCurrency(totalBalance)}
                        </p>
                    </div>

                    {/* Income */}
                    <div className="bg-white rounded-xl shadow-lg p-6 flex flex-col justify-between h-32 border-l-4 border-green-500">
                        <p className="text-gray-500 font-medium text-sm uppercase">Ingresos (Mes)</p>
                        <p className="text-3xl font-bold text-green-600">
                            + {formatCurrency(income)}
                        </p>
                    </div>

                    {/* Expenses */}
                    <div className="bg-white rounded-xl shadow-lg p-6 flex flex-col justify-between h-32 border-l-4 border-red-500">
                        <p className="text-gray-500 font-medium text-sm uppercase">Gastos (Mes)</p>
                        <p className="text-3xl font-bold text-red-600">
                            - {formatCurrency(expense)}
                        </p>
                    </div>
                </div>

                {/* Main Content Grid: Chart + Quick Actions */}
                <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left: Chart */}
                    <div className="lg:col-span-2 bg-white rounded-xl shadow p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-bold text-gray-900">Gastos por Categoría</h2>
                            <Link href="/dashboard/charts" className="text-blue-600 text-sm font-medium hover:underline">
                                Ver Gráficos Detallados &rarr;
                            </Link>
                        </div>
                        <DashboardCharts data={chartData} />
                    </div>

                    {/* Right: Quick Actions */}
                    <div className="lg:col-span-1 flex flex-col space-y-4">
                        <h2 className="text-lg font-bold text-gray-900 mb-4 md:hidden">Acciones Rápidas</h2>
                        <div className="grid grid-cols-2 gap-4 h-full">
                            <Link href="/transactions/new" className="col-span-2 bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-lg shadow flex items-center justify-center font-bold transition-transform transform hover:-translate-y-1">
                                + Nueva Transacción
                            </Link>
                            <Link href="/transactions" className="bg-white hover:bg-gray-50 text-blue-600 p-4 rounded-lg shadow flex flex-col items-center justify-center text-center font-medium border border-blue-100 transition-colors">
                                <span className="text-2xl mb-1">📋</span>
                                Historial
                            </Link>
                            <Link href="/accounts" className="bg-white hover:bg-gray-50 text-indigo-600 p-4 rounded-lg shadow flex flex-col items-center justify-center text-center font-medium border border-indigo-100 transition-colors">
                                <span className="text-2xl mb-1">💳</span>
                                Cuentas
                            </Link>
                            <Link href="/settings" className="col-span-2 bg-gray-50 hover:bg-gray-100 text-gray-600 p-4 rounded-lg shadow flex items-center justify-center font-medium border border-gray-200 transition-colors">
                                ⚙️ Configuración & Familia
                            </Link>
                        </div>
                    </div>
                </div>

                {/* Recent Activity */}
                <div className="mt-8 mb-12">
                    <h2 className="text-xl font-bold text-gray-900 mb-4 px-1">Actividad Reciente</h2>
                    <div className="bg-white rounded-xl shadow overflow-hidden">
                        {(recentTxRes.data?.length ?? 0) > 0 ? (
                            <ul className="divide-y divide-gray-100">
                                {recentTxRes.data!.map((tx: any) => (
                                    <li key={tx.id} className="p-4 hover:bg-gray-50 transition-colors">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center space-x-4">
                                                <div className={`p-2 rounded-full ${tx.type === 'income' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                                                    {tx.type === 'income' ? '💰' : '💸'}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-gray-900">{tx.description}</p>
                                                    <p className="text-xs text-gray-500">
                                                        {new Date(tx.date).toLocaleDateString()} • {tx.categories?.name || 'Sin categoría'}
                                                    </p>
                                                </div>
                                            </div>
                                            <span className={`font-bold ${tx.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                                                {tx.type === 'income' ? '+' : '-'} {formatCurrency(tx.amount)}
                                            </span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div className="p-8 text-center text-gray-500">
                                <p>No hay actividad reciente.</p>
                                <p className="text-sm mt-2">¡Registra tu primera transacción!</p>
                            </div>
                        )}
                        <div className="bg-gray-50 p-3 text-center border-t border-gray-100">
                            <Link href="/transactions" className="text-sm font-medium text-blue-600 hover:text-blue-500">
                                Ver todo el historial &rarr;
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
