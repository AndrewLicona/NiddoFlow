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

export default async function DashboardPage(props: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const searchParams = await props.searchParams;
    const code = searchParams.code as string;

    // Emergency redirect if OAuth code lands on root instead of /auth/callback
    if (code) {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || '';
        redirect(`${baseUrl}/auth/callback?code=${code}`);
    }

    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')
    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

    if (!profile?.family_id) redirect('/onboarding')

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

    const allAccounts = accountsRes.data || []
    const myAccounts = allAccounts.filter(acc =>
        acc.family_id === profile.family_id &&
        (acc.type === 'joint' || (acc.type === 'personal' && acc.user_id === user.id))
    )
    const totalBalance = myAccounts.reduce((acc: number, curr: any) => acc + Number(curr.balance), 0)

    const monthlyTxs = monthlyStatsRes.data || []
    const income = monthlyTxs.filter(t => t.type === 'income').reduce((acc, curr) => acc + Number(curr.amount), 0)
    const expense = monthlyTxs.filter(t => t.type === 'expense').reduce((acc, curr) => acc + Number(curr.amount), 0)

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
            relevantTxs = relevantTxs.filter(t => new Date(t.date) >= startOfWeek)
        }

        const spent = relevantTxs.reduce((acc, curr) => acc + Number(curr.amount), 0)
        return { ...b, spent, percent: Math.min((spent / b.amount) * 100, 100) }
    })

    const budgetAlerts = currentBudgets.filter(b => b.percent >= 80)
    const debtToPay = (debtsRes.data || []).filter(d => d.type === 'to_pay').reduce((acc, curr) => acc + (Number(curr.total_amount) - Number(curr.paid_amount)), 0)
    const debtToReceive = (debtsRes.data || []).filter(d => d.type === 'to_receive').reduce((acc, curr) => acc + (Number(curr.total_amount) - Number(curr.paid_amount)), 0)

    const expensesByCategory = monthlyTxs
        .filter(t => t.type === 'expense')
        .reduce((acc: any, curr: any) => {
            const catName = curr.categories?.name || 'Otros'
            acc[catName] = (acc[catName] || 0) + Number(curr.amount)
            return acc
        }, {})

    const chartData = Object.entries(expensesByCategory).map(([name, value]) => ({
        name,
        value: Number(value),
        color: ''
    }))

    const displayName = user.user_metadata?.full_name || profile.full_name || user.email

    return (
        <main className="max-w-6xl mx-auto p-4 md:p-8 pt-10 md:pt-8 space-y-6 md:space-y-10 min-h-screen pb-24">
            <PageHeader
                title={`Hola, ${displayName?.split(' ')[0]}`}
                description="Aquí tienes un resumen de tu armonía financiera hoy."
                showProfile
                userProfile={profile}
            />

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8">
                <Card variant="elevated" className="relative overflow-hidden group bg-indigo-600 dark:bg-indigo-900 shadow-indigo-500/20 border-none">
                    <div className="absolute top-0 right-0 p-4 text-white opacity-10 group-hover:opacity-20 transition-opacity">
                        <Wallet size={64} strokeWidth={1.5} />
                    </div>
                    <Typography variant="small" className="text-white font-black uppercase tracking-widest text-[9px] opacity-60">Balance Total</Typography>
                    <Typography variant="h1" className="mt-1 tracking-tighter text-white">
                        {formatCurrency(totalBalance)}
                    </Typography>
                </Card>
                <Card variant="elevated" className="relative overflow-hidden group border-emerald-500/10">
                    <div className="absolute top-0 right-0 p-4 text-emerald-500 opacity-10 group-hover:opacity-20 transition-opacity">
                        <TrendingUp size={64} strokeWidth={1.5} />
                    </div>
                    <Typography variant="small" className="text-foreground font-black uppercase tracking-widest text-[9px] opacity-70">Ingresos (Mes)</Typography>
                    <Typography variant="h2" className="mt-1 tracking-tighter text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(income)}
                    </Typography>
                </Card>
                <Card variant="elevated" className="relative overflow-hidden group border-rose-500/10">
                    <div className="absolute top-0 right-0 p-4 text-rose-500 opacity-10 group-hover:opacity-20 transition-opacity">
                        <TrendingDown size={64} strokeWidth={1.5} />
                    </div>
                    <Typography variant="small" className="text-foreground font-black uppercase tracking-widest text-[9px] opacity-70">Gastos (Mes)</Typography>
                    <Typography variant="h2" className="mt-1 tracking-tighter text-rose-600 dark:text-rose-400">
                        {formatCurrency(expense)}
                    </Typography>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-10">
                {/* Left Column: Alerts & Charts */}
                <div className="lg:col-span-8 space-y-6 md:space-y-10">
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
                                <Link href="/budgets">
                                    <Button variant="ghost" size="sm" className="group text-foreground/50 hover:text-blue-600">
                                        Gestionar
                                        <ChevronRight size={16} className="ml-1 group-hover:translate-x-1 transition-transform" />
                                    </Button>
                                </Link>
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
                                        <div className="h-2 w-full bg-foreground/[0.03] rounded-full overflow-hidden">
                                            <div
                                                className={`h-full transition-all duration-1000 ${b.percent >= 100 ? 'bg-rose-500' :
                                                    b.percent >= 80 ? 'bg-orange-500' :
                                                        'bg-indigo-500'
                                                    }`}
                                                style={{ width: `${b.percent}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}
                </div>

                {/* Right Column: Mini Widgets */}
                <div className="lg:col-span-4 space-y-6 md:space-y-10">
                    <Card variant="elevated">
                        <div className="flex justify-between items-center mb-6">
                            <Typography variant="h3" className="text-foreground font-black">Mis Cuentas</Typography>
                            <Link href="/accounts">
                                <Button variant="ghost" size="sm" className="text-foreground/30 hover:text-blue-600">
                                    Ver todas
                                </Button>
                            </Link>
                        </div>
                        <div className="space-y-4">
                            {myAccounts.slice(0, 3).map(acc => (
                                <div key={acc.id} className="flex justify-between items-center p-4 bg-foreground/[0.02] rounded-2xl border border-foreground/[0.03]">
                                    <div>
                                        <Typography variant="body" className="font-bold text-foreground">{acc.name}</Typography>
                                        <Typography variant="small" className="text-[10px] opacity-40 uppercase font-black">{acc.type === 'joint' ? 'Familiar' : 'Personal'}</Typography>
                                    </div>
                                    <Typography variant="body" className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                                        {formatCurrency(acc.balance)}
                                    </Typography>
                                </div>
                            ))}
                        </div>
                    </Card>

                    <Card variant="elevated">
                        <div className="flex justify-between items-center mb-6">
                            <Typography variant="h3" className="text-foreground font-black">Actividad Reciente</Typography>
                            <Link href="/transactions">
                                <LucideHistory size={18} className="text-foreground/30 hover:text-blue-600 transition-colors" />
                            </Link>
                        </div>
                        <div className="space-y-4">
                            {(recentTxRes.data || []).map(tx => (
                                <div key={tx.id} className="flex justify-between items-center p-3 hover:bg-foreground/[0.02] rounded-xl transition-colors">
                                    <div className="flex items-center space-x-3">
                                        <div className={`p-2 rounded-lg ${tx.type === 'income' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'}`}>
                                            {tx.type === 'income' ? <ArrowUpCircle size={16} /> : <ArrowDownCircle size={16} />}
                                        </div>
                                        <div>
                                            <Typography variant="small" className="font-bold text-foreground leading-tight line-clamp-1">{tx.description}</Typography>
                                            <Typography variant="small" className="text-[9px] opacity-30 uppercase font-black tracking-widest">{new Date(tx.date).toLocaleDateString()}</Typography>
                                        </div>
                                    </div>
                                    <Typography variant="small" className={`font-mono font-bold ${tx.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                                    </Typography>
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>
            </div>
        </main>
    )
}
