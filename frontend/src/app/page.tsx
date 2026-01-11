import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import ChartCarousel from './dashboard/components/ChartCarousel'
import SmartFeed from './dashboard/components/SmartFeed'
import { formatCurrency } from '@/utils/format'
import { getWeekNumber, getStartOfWeek } from '@/utils/date'
import { Typography } from '@/components/ui/atoms/Typography'
import { Button } from '@/components/ui/atoms/Button'
import { Card } from '@/components/ui/molecules/Card'
import { PageHeader } from '@/components/ui/molecules/PageHeader'
import {
    Wallet,
    History as LucideHistory,
    ArrowUpCircle,
    ArrowDownCircle,
    Plus,
    ChevronRight,
    TrendingUp,
    TrendingDown,
    FileText
} from 'lucide-react'
import OnboardingTour from '@/components/ui/organisms/OnboardingTour'


interface Budget {
    id: string
    amount: number
    categories?: { name: string } | null
    spent: number
    percent: number
    category_id: string
    period?: string
    month?: number
    week_number?: number
    start_date?: string
    end_date?: string
}


interface Transaction {
    id?: string;
    amount: number;
    type: 'income' | 'expense' | 'transfer';
    date: string;
    description?: string;
    category_id?: string;
    categories?: { name: string } | null;
}

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

    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
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

    const startOfMonthISO = new Date(today.getFullYear(), today.getMonth(), 1).toISOString()
    const endOfMonthISO = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999).toISOString()


    const [accountsRes, recentTxRes, monthlyStatsRes, budgetsRes, debtsRes, statsRes, profilesRes] = await Promise.all([
        supabase.from('accounts').select('*').or(`family_id.eq.${profile.family_id},user_id.eq.${user.id}`),
        supabase.from('transactions').select('*, categories(name, icon)').eq('family_id', profile.family_id).order('date', { ascending: false }).limit(5),
        supabase.from('transactions').select('amount, type, category_id, date, categories(name)').eq('family_id', profile.family_id).gte('date', startOfMonthISO).lte('date', endOfMonthISO),
        supabase.from('budgets').select('*, categories(name)').eq('family_id', profile.family_id).eq('year', currentYear),
        supabase.from('debts').select('*').eq('family_id', profile.family_id).eq('status', 'active'),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/stats/dashboard`, {
            headers: { 'Authorization': `Bearer ${session?.access_token}` },
            next: { revalidate: 3600 }
        }).then(res => res.json()),
        supabase.from('profiles').select('id, full_name').eq('family_id', profile.family_id)
    ])

    const stats = statsRes || { total_balance: 0, monthly_income: 0, monthly_expense: 0, trends: [] }



    const totalBalance = stats.total_balance
    const income = stats.monthly_income
    const expense = stats.monthly_expense

    const allAccounts = accountsRes.data || []
    const myAccounts = allAccounts.filter(acc =>
        acc.family_id === profile.family_id &&
        (acc.type === 'joint' || (acc.type === 'personal' && acc.user_id === user.id))
    )

    const monthlyTxs = (monthlyStatsRes.data as unknown as Transaction[])?.map((t: Transaction, idx: number) => ({
        ...t,
        id: t.id || `temp-${idx}`,
    })) || []

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
        return { ...b, spent, percent: Math.min((spent / b.amount) * 100, 100) } as Budget
    })

    const budgetAlerts = currentBudgets.filter(b => b.percent >= 80)
    const debtToPay = (debtsRes.data || []).filter(d => d.type === 'to_pay').reduce((acc, curr) => acc + (Number(curr.total_amount) - Number(curr.paid_amount)), 0)
    const debtToReceive = (debtsRes.data || []).filter(d => d.type === 'to_receive').reduce((acc, curr) => acc + (Number(curr.total_amount) - Number(curr.paid_amount)), 0)


    const displayName = user.user_metadata?.full_name || profile.full_name || user.email

    return (
        <main className="max-w-6xl mx-auto p-4 md:p-8 pt-10 md:pt-8 space-y-6 md:space-y-10 min-h-screen pb-24">
            <OnboardingTour startTour={!profile.onboarding_completed} />
            <div id="tour-welcome"> {/* Wrapper for PageHeader to attach welcome step */}
                <PageHeader
                    title={`Hola, ${displayName?.split(' ')[0]}`}
                    description="Aquí tienes un resumen de tu armonía financiera hoy."
                    showProfile
                    userProfile={profile}
                    actions={
                        <div className="flex space-x-2">
                            <Link href="/reports">
                                <Button id="tour-reports" variant="outline" size="sm" className="rounded-full h-10 w-10 p-0 border-foreground/10 text-foreground/60 hover:text-blue-600 hover:border-blue-600/30">
                                    <FileText size={20} />
                                </Button>
                            </Link>
                            <Link href="/transactions/new">
                                <Button id="tour-new-tx" variant="primary" size="sm" className="rounded-full h-10 w-10 p-0 shadow-xl shadow-blue-500/30">
                                    <Plus size={24} />
                                </Button>
                            </Link>
                        </div>
                    }
                />
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-8">
                <Card id="tour-balance" variant="elevated" className="col-span-2 md:col-span-1 relative overflow-hidden group bg-indigo-600 dark:bg-indigo-900 shadow-indigo-500/20 border-none">
                    <div className="absolute top-0 right-0 p-4 text-white opacity-10 group-hover:opacity-20 transition-opacity">
                        <Wallet size={64} strokeWidth={1.5} />
                    </div>
                    <Typography variant="small" className="text-white font-black uppercase tracking-widest text-[9px] opacity-60">Balance Total</Typography>
                    <Typography variant="h1" className="mt-1 tracking-tighter text-white">
                        {formatCurrency(totalBalance)}
                    </Typography>
                </Card>
                <Card id="tour-income" variant="elevated" className="relative overflow-hidden group border-emerald-500/10">
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

                    {/* Smart Feed (Alerts + AI) */}
                    <div id="tour-smartfeed">
                        <SmartFeed
                            budgetAlerts={budgetAlerts}
                            debtToPay={debtToPay}
                            debtToReceive={debtToReceive}
                            transactions={recentTxRes.data || []}
                            budgets={currentBudgets}
                        />
                    </div>

                    {/* Carousel Section */}
                    <ChartCarousel
                        trends={stats.trends}
                        accounts={accountsRes.data || []}
                        profiles={profilesRes.data || []}
                        transactions={monthlyTxs} // Reuse monthly for simple charts
                    />

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
                                                <Typography variant="body" className="font-bold text-foreground">{b.categories?.name}</Typography>
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
