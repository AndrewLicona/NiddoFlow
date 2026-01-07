import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { signout } from './login/actions'
import { seedTestData } from './seed/actions'
import DashboardCharts from './dashboard/DashboardCharts'
import { formatCurrency } from '@/utils/format'
import { getWeekNumber, getStartOfWeek } from '@/utils/date'
import { Typography } from '@/components/ui/atoms/Typography'
import { Button } from '@/components/ui/atoms/Button'
import { Card } from '@/components/ui/molecules/Card'
import { PageHeader } from '@/components/ui/molecules/PageHeader'
import {
    Wallet,
    History as LucideHistory,
    CreditCard,
    ShieldCheck,
    Banknote,
    AlertCircle,
    ArrowUpCircle,
    ArrowDownCircle,
    LogOut,
    Plus,
    ChevronRight,
    TrendingUp,
    TrendingDown
} from 'lucide-react'

export default async function DashboardPage() {
    const supabase = await createClient()

    // 1. Auth Check - Using safer approach
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) redirect('/login')
    const user = session.user

    // 2. Profile & Family Check
    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

    if (!profile?.family_id) redirect('/onboarding')

    // 3. Fetch Data in Parallel
    const today = new Date()
    const currentMonth = today.getMonth() + 1
    const currentYear = today.getFullYear()
    const currentWeek = getWeekNumber(today)

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString()
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999).toISOString()

    const [accountsRes, recentTxRes, monthlyStatsRes, budgetsRes, debtsRes] = await Promise.all([
        supabase.from('accounts').select('*').or(`family_id.eq.${profile.family_id},user_id.eq.${user.id}`),
        supabase.from('transactions').select('*, categories(name, icon)').eq('family_id', profile.family_id).order('date', { ascending: false }).limit(5),
        supabase.from('transactions').select('amount, type, category_id, date, categories(name)').eq('family_id', profile.family_id).gte('date', startOfMonth).lte('date', endOfMonth),
        supabase.from('budgets').select('*, categories(name)').eq('family_id', profile.family_id).eq('year', currentYear),
        supabase.from('debts').select('*').eq('family_id', profile.family_id).eq('status', 'active')
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

    // 6. Process Budgets (Filtering current month/week in JS for safety)
    const allBudgets = budgetsRes.data || []
    const now = new Date();
    const currentBudgets = allBudgets.filter(b => {
        if (b.start_date && b.end_date) {
            const start = new Date(b.start_date);
            const end = new Date(b.end_date);
            end.setHours(23, 59, 59, 999);
            return now >= start && now <= end;
        }
        if (b.period === 'monthly') return b.month === currentMonth;
        if (b.period === 'weekly') return b.week_number === currentWeek;
        return false;
    }).map(b => {
        let relevantTxs = monthlyTxs.filter(t => t.type === 'expense' && t.category_id === b.category_id)

        if (b.start_date && b.end_date) {
            const start = new Date(b.start_date);
            const end = new Date(b.end_date);
            end.setHours(23, 59, 59, 999);
            relevantTxs = relevantTxs.filter(t => {
                const txDate = new Date(t.date)
                return txDate >= start && txDate <= end
            })
        } else if (b.period === 'weekly') {
            const startOfWeek = getStartOfWeek(currentWeek, currentYear)
            const endOfWeek = new Date(startOfWeek)
            endOfWeek.setDate(startOfWeek.getDate() + 6)
            endOfWeek.setHours(23, 59, 59, 999)

            relevantTxs = relevantTxs.filter(t => {
                const txDate = new Date(t.date)
                return txDate >= startOfWeek && txDate <= endOfWeek
            })
        }

        const spent = relevantTxs.reduce((acc, t) => acc + Number(t.amount), 0)
        return { ...b, spent, percent: (spent / b.amount) * 100 }
    })

    const budgetAlerts = currentBudgets.filter(b => b.percent >= 80)

    // Debt Totals
    const activeDebts = debtsRes.data || []
    const debtToPay = activeDebts.filter(d => d.type === 'to_pay').reduce((acc, d) => acc + Number(d.remaining_amount), 0)
    const debtToReceive = activeDebts.filter(d => d.type === 'to_receive').reduce((acc, d) => acc + Number(d.remaining_amount), 0)

    // Aggregate Expenses by Category
    const expensesByCategory: Record<string, number> = {}
    monthlyTxs
        .filter(t => t.type === 'expense')
        .forEach((t: any) => {
            const catName = t.categories?.name || 'Varios'
            expensesByCategory[catName] = (expensesByCategory[catName] || 0) + Number(t.amount)
        })

    const chartData = Object.entries(expensesByCategory).map(([name, value]) => ({
        name,
        value,
        color: ''
    }))

    const displayName = user.user_metadata?.full_name || profile.full_name || user.email

    return (
        <main className="max-w-6xl mx-auto p-4 md:p-8 space-y-8 min-h-screen pb-24">
            <PageHeader
                title={`Hola, ${displayName?.split(' ')[0]}`}
                description="Tu resumen financiero familiar está al día."
            />

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card variant="elevated" className="relative overflow-hidden group border-indigo-500/10">
                    <div className="absolute top-0 right-0 p-4 text-indigo-500 opacity-20 group-hover:opacity-40 transition-opacity">
                        <Wallet size={64} strokeWidth={1.5} />
                    </div>
                    <Typography variant="small" className="text-foreground font-black uppercase tracking-widest text-[10px] opacity-70">Balance Total</Typography>
                    <Typography variant="h1" className={`mt-2 tracking-tighter ${totalBalance >= 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {formatCurrency(totalBalance)}
                    </Typography>
                </Card>
                <Card variant="elevated" className="relative overflow-hidden group border-emerald-500/10">
                    <div className="absolute top-0 right-0 p-4 text-emerald-500 opacity-20 group-hover:opacity-40 transition-opacity">
                        <TrendingUp size={64} strokeWidth={1.5} />
                    </div>
                    <Typography variant="small" className="text-foreground font-black uppercase tracking-widest text-[10px] opacity-70">Ingresos (Mes)</Typography>
                    <Typography variant="h1" className="mt-2 tracking-tighter text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(income)}
                    </Typography>
                </Card>
                <Card variant="elevated" className="relative overflow-hidden group border-rose-500/10">
                    <div className="absolute top-0 right-0 p-4 text-rose-500 opacity-20 group-hover:opacity-40 transition-opacity">
                        <TrendingDown size={64} strokeWidth={1.5} />
                    </div>
                    <Typography variant="small" className="text-foreground font-black uppercase tracking-widest text-[10px] opacity-70">Gastos (Mes)</Typography>
                    <Typography variant="h1" className="mt-2 tracking-tighter text-rose-600 dark:text-rose-400">
                        {formatCurrency(expense)}
                    </Typography>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left Column: Alerts & Charts */}
                <div className="lg:col-span-8 space-y-8">
                    {/* Alerts Section */}
                    {(budgetAlerts.length > 0 || debtToPay > 0 || debtToReceive > 0) && (
                        <Card variant="glass" className="border-rose-500/20 bg-rose-500/[0.02]">
                            <div className="flex items-center space-x-2 mb-4">
                                <AlertCircle size={20} className="text-rose-500" />
                                <Typography variant="h3" className="text-rose-950 dark:text-rose-50">Alertas Críticas</Typography>
                            </div>
                            <div className="space-y-3">
                                {debtToPay > 0 && (
                                    <div className="flex items-center text-rose-700 bg-white/50 dark:bg-slate-800/50 p-4 rounded-2xl border border-rose-100 dark:border-rose-500/20 shadow-sm">
                                        <Typography variant="body" className="font-bold text-rose-800 dark:text-rose-200">
                                            Tienes compromisos por pagar: <strong>{formatCurrency(debtToPay)}</strong>.
                                        </Typography>
                                    </div>
                                )}
                                {budgetAlerts.map(b => (
                                    <div key={b.id} className="flex items-center text-orange-700 bg-white/50 dark:bg-slate-800/50 p-4 rounded-2xl border border-orange-100 dark:border-orange-500/20 shadow-sm">
                                        <Typography variant="body" className="font-bold text-orange-800 dark:text-orange-200">
                                            Presupuesto {b.period === 'weekly' ? 'semanal' : 'mensual'} {b.percent >= 100 ? 'excedido' : 'al límite'} en <strong>{(b.categories as any)?.name || 'General'}</strong>.
                                        </Typography>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}

                    <Card variant="elevated">
                        <div className="flex justify-between items-center mb-6">
                            <Typography variant="h3" className="text-foreground font-black">Distribución de Gastos</Typography>
                            <Link href="/dashboard/charts">
                                <Button variant="ghost" size="sm" className="group text-foreground/50 hover:text-blue-600">
                                    Detalles
                                    <ChevronRight size={16} className="ml-1 group-hover:translate-x-1 transition-transform" />
                                </Button>
                            </Link>
                        </div>
                        <DashboardCharts data={chartData} />
                    </Card>

                    {/* New Budgets Section */}
                    {currentBudgets.length > 0 && (
                        <Card variant="elevated">
                            <div className="flex justify-between items-center mb-6">
                                <Typography variant="h3" className="text-foreground font-black">Estado de Presupuestos</Typography>
                                <Typography variant="small" className="opacity-50 font-bold uppercase tracking-widest text-[10px]">Actual</Typography>
                            </div>
                            <div className="grid gap-6">
                                {currentBudgets.map(b => (
                                    <div key={b.id} className="space-y-2">
                                        <div className="flex justify-between items-end">
                                            <div>
                                                <Typography variant="body" className="font-bold text-foreground">{(b.categories as any)?.name}</Typography>
                                                <div className="flex items-center space-x-2">
                                                    <Typography variant="small" className="text-[10px] opacity-50 uppercase font-black">
                                                        {b.period === 'weekly' ? 'Semanal' : b.period === 'biweekly' ? 'Quincenal' : b.period === 'custom' ? 'Manual' : 'Mensual'}
                                                    </Typography>
                                                    {b.start_date && b.end_date && (
                                                        <>
                                                            <span className="h-0.5 w-0.5 rounded-full bg-foreground/20" />
                                                            <Typography variant="small" className="text-[9px] opacity-40 lowercase font-bold">
                                                                {new Date(b.start_date + 'T00:00:00').toLocaleDateString('es', { day: 'numeric', month: 'short' })} - {new Date(b.end_date + 'T00:00:00').toLocaleDateString('es', { day: 'numeric', month: 'short' })}
                                                            </Typography>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                            <Typography variant="small" className="font-mono opacity-80">
                                                {formatCurrency(b.spent)} / {formatCurrency(b.amount)}
                                            </Typography>
                                        </div>
                                        <div className="h-2 w-full bg-foreground/[0.05] rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-1000 ${b.percent >= 100 ? 'bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.4)]' :
                                                    b.percent >= 80 ? 'bg-orange-500' : 'bg-indigo-500'
                                                    }`}
                                                style={{ width: `${Math.min(b.percent, 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}

                    {/* Recent Activity */}
                    <Card variant="elevated">
                        <div className="flex justify-between items-center mb-6">
                            <Typography variant="h3" className="text-foreground font-black">Actividad Reciente</Typography>
                            <Link href="/transactions">
                                <Button variant="ghost" size="sm" className="group text-foreground/50 hover:text-blue-600">
                                    Ver Todo
                                    <ChevronRight size={16} className="ml-1 group-hover:translate-x-1 transition-transform" />
                                </Button>
                            </Link>
                        </div>
                        <div className="overflow-hidden rounded-2xl border border-foreground/[0.03]">
                            {(recentTxRes.data?.length ?? 0) > 0 ? (
                                <ul className="divide-y divide-foreground/[0.03]">
                                    {recentTxRes.data!.map((tx: any) => (
                                        <li key={tx.id} className="p-4 hover:bg-foreground/[0.01] transition-colors group">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center space-x-4">
                                                    <div className={`p-2.5 rounded-2xl shadow-sm ${tx.type === 'income' ? 'bg-emerald-500/[0.15] text-emerald-600 dark:text-emerald-400 border border-emerald-500/10' : 'bg-rose-500/[0.15] text-rose-600 dark:text-rose-400 border border-rose-500/10'
                                                        }`}>
                                                        {tx.type === 'income' ? <ArrowDownCircle size={18} /> : <ArrowUpCircle size={18} />}
                                                    </div>
                                                    <div>
                                                        <Typography variant="body" className="font-bold text-foreground/90">{tx.description}</Typography>
                                                        <Typography variant="muted" className="text-[10px] font-black uppercase tracking-widest text-foreground/70">
                                                            {new Date(tx.date).toLocaleDateString()} • {tx.categories?.name || 'Varios'}
                                                        </Typography>
                                                    </div>
                                                </div>
                                                <Typography variant="body" className={`font-black ${tx.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                                    {tx.type === 'income' ? '+' : '-'} {formatCurrency(tx.amount)}
                                                </Typography>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="p-12 text-center">
                                    <Typography variant="body" className="italic opacity-40">No hay actividad reciente.</Typography>
                                </div>
                            )}
                        </div>
                    </Card>
                </div>

                {/* Right Column: Actions & Quick Stats */}
                <div className="lg:col-span-4 space-y-8">
                    <Card variant="elevated">
                        <Typography variant="small" className="text-foreground font-black mb-6 uppercase tracking-widest text-[10px]">Acciones Rápidas</Typography>
                        <div className="grid grid-cols-2 gap-3">
                            <Link href="/transactions/new" className="col-span-2">
                                <Button className="w-full bg-blue-600 text-white hover:bg-blue-700 border-none shadow-lg font-black py-4 duration-300">
                                    <Plus size={20} className="mr-2" strokeWidth={3} />
                                    Nueva Transacción
                                </Button>
                            </Link>
                            <Link href="/transactions">
                                <Button variant="secondary" className="w-full px-2 bg-slate-500/10 text-slate-600 dark:text-slate-400 hover:bg-slate-500/20 font-bold duration-300">
                                    <LucideHistory size={16} className="mr-2" />
                                    Historial
                                </Button>
                            </Link>
                            <Link href="/accounts">
                                <Button variant="secondary" className="w-full px-2 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20 font-bold duration-300">
                                    <CreditCard size={16} className="mr-2" />
                                    Cuentas
                                </Button>
                            </Link>
                            <Link href="/budgets">
                                <Button variant="secondary" className="w-full px-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 font-bold duration-300">
                                    <ShieldCheck size={16} className="mr-2" />
                                    Límites
                                </Button>
                            </Link>
                            <Link href="/debts">
                                <Button variant="secondary" className="w-full px-2 bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 font-bold duration-300">
                                    <Banknote size={16} className="mr-2" />
                                    Deudas
                                </Button>
                            </Link>

                            <form action={seedTestData} className="col-span-2 mt-4">
                                <Button variant="outline" className="w-full border-indigo-500/20 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all font-black py-4">
                                    ✨ Generar Historial (Mes y Semanas)
                                </Button>
                            </form>
                        </div>
                    </Card>

                    <Card variant="elevated">
                        <Typography variant="small" className="text-foreground font-black mb-4 uppercase tracking-widest text-[10px]">Salud Financiera (Mes)</Typography>
                        <div className="space-y-6">
                            <div className="flex justify-between items-end">
                                <div>
                                    <Typography variant="muted" className="text-xs font-bold text-foreground/70">Balance Neto</Typography>
                                    <Typography variant="h2" className={`mt-0.5 font-black tracking-tight ${income - expense >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                        {formatCurrency(income - expense)}
                                    </Typography>
                                </div>
                                <div className="text-right">
                                    <Typography variant="muted" className="text-xs font-bold text-foreground/70">Uso de Ingresos</Typography>
                                    <Typography variant="body" className="font-black mt-0.5">
                                        {Math.round((expense / (income || 1)) * 100)}%
                                    </Typography>
                                </div>
                            </div>

                            <div className="w-full bg-foreground/5 h-4 rounded-full overflow-hidden shadow-inner flex">
                                <div
                                    className="bg-emerald-500 h-full transition-all duration-1000"
                                    style={{ width: `${Math.min((income / (income + expense || 1)) * 100, 100)}%` }}
                                />
                                <div
                                    className="bg-rose-500 h-full transition-all duration-1000 opacity-80"
                                    style={{ width: `${Math.min((expense / (income + expense || 1)) * 100, 100)}%` }}
                                />
                            </div>

                            <div className="flex justify-between text-[10px] font-black uppercase tracking-tighter opacity-50">
                                <div className="flex items-center"><div className="w-2 h-2 rounded-full bg-emerald-500 mr-2" /> Ingresos</div>
                                <div className="flex items-center"><div className="w-2 h-2 rounded-full bg-rose-500 mr-2" /> Gastos</div>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        </main >
    )
}
