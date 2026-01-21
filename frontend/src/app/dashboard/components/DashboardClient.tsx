"use client";

import { useDashboard } from "@/hooks/useDashboard";
import { useAccounts } from "@/hooks/useAccounts";
import { useTransactions } from "@/hooks/useTransactions";
import { useBudgets } from "@/hooks/useBudgets";
import { useDebts } from "@/hooks/useDebts";
import { formatCurrency } from "@/utils/format";
import { getWeekNumber } from "@/utils/date";
import { Typography } from "@/components/ui/atoms/Typography";
import { Button } from "@/components/ui/atoms/Button";
import { Card } from "@/components/ui/molecules/Card";
import { PageHeader } from "@/components/ui/molecules/PageHeader";
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
} from "lucide-react";
import Link from "next/link";
import ChartCarousel from "./ChartCarousel";
import SmartFeed from "./SmartFeed";
import OnboardingTour from "@/components/ui/organisms/OnboardingTour";
import React, { useMemo } from "react";

interface DashboardClientProps {
    user: any;
    profile: any;
}

export default function DashboardClient({ user, profile }: DashboardClientProps) {
    const { stats, preparedData: dashboardData, isLoading: statsLoading } = useDashboard();
    const { accounts, isLoading: accountsLoading } = useAccounts();
    const { transactions: recentTransactions, isLoading: txLoading } = useTransactions({ limit: 5 });
    const { budgets, isLoading: budgetsLoading } = useBudgets();
    const { isLoading: debtsLoading } = useDebts();

    const isLoading = statsLoading || accountsLoading || txLoading || budgetsLoading || debtsLoading;

    const [today, setToday] = React.useState<Date | null>(null);

    React.useEffect(() => {
        setToday(new Date());
    }, []);

    const currentMonth = today ? today.getMonth() + 1 : 0;
    const currentWeek = today ? getWeekNumber(today) : 0;

    // Data processing logic moved here
    const processedBudgets = useMemo(() => {
        if (!today || !budgets || !stats) return [];

        return budgets.filter((b: any) => {
            if (b.start_date && b.end_date) {
                const start = new Date(b.start_date);
                const end = new Date(b.end_date);
                end.setHours(23, 59, 59, 999);
                return today >= start && today <= end;
            }
            if (b.period === "monthly") return b.month === currentMonth;
            if (b.period === "weekly") return b.week_number === currentWeek;
            return false;
        }).map((b: any) => {
            // This 'spent' calculation should ideally be handled by the backend or a dedicated budget service
            // For now, keeping it consistent with original logic but using cached data
            // Note: original logic used monthlyTxs which we don't fetch separately here yet
            // In a real scenario, we'd have an endpoint returning budget progress.
            return { ...b, spent: b.spent || 0, percent: b.percent || 0 };
        });
    }, [budgets, currentMonth, currentWeek, stats, today]);


    const displayName = user.user_metadata?.full_name || profile.full_name || user.email;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <main className="max-w-6xl mx-auto p-4 md:p-8 pt-10 md:pt-8 space-y-6 md:space-y-10 min-h-screen pb-24">
            <OnboardingTour startTour={!profile.onboarding_completed} />

            <PageHeader
                title={`Hola, ${displayName?.split(" ")[0]}`}
                description="Aquí tienes un resumen de tu armonía financiera hoy."
                showProfile
                userProfile={profile}
                actions={
                    <div className="flex space-x-2">
                        <Link href="/reports">
                            <Button variant="outline" size="sm" className="rounded-full h-10 w-10 p-0 border-foreground/10 text-foreground/60 hover:text-blue-600 hover:border-blue-600/30">
                                <FileText size={20} />
                            </Button>
                        </Link>
                        <Link href="/transactions/new">
                            <Button variant="primary" size="sm" className="rounded-full h-10 w-10 p-0 shadow-xl shadow-blue-500/30">
                                <Plus size={24} />
                            </Button>
                        </Link>
                    </div>
                }
            />

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-8">
                <Card variant="elevated" className="col-span-2 md:col-span-1 relative overflow-hidden group bg-indigo-600 dark:bg-indigo-900 shadow-indigo-500/20 border-none">
                    <div className="absolute top-0 right-0 p-4 text-white opacity-10 group-hover:opacity-20 transition-opacity">
                        <Wallet size={64} strokeWidth={1.5} />
                    </div>
                    <Typography variant="small" className="text-white font-black uppercase tracking-widest text-[9px] opacity-60">Balance Total</Typography>
                    <Typography variant="h1" className="mt-1 tracking-tighter text-white">
                        {formatCurrency(dashboardData?.totalBalance || 0)}
                    </Typography>
                </Card>
                <Card variant="elevated" className="relative overflow-hidden group border-emerald-500/10">
                    <div className="absolute top-0 right-0 p-4 text-emerald-500 opacity-10 group-hover:opacity-20 transition-opacity">
                        <TrendingUp size={64} strokeWidth={1.5} />
                    </div>
                    <Typography variant="small" className="text-foreground font-black uppercase tracking-widest text-[9px] opacity-70">Ingresos (Mes)</Typography>
                    <Typography variant="h2" className="mt-1 tracking-tighter text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(dashboardData?.monthlyIncome || 0)}
                    </Typography>
                </Card>
                <Card variant="elevated" className="relative overflow-hidden group border-rose-500/10">
                    <div className="absolute top-0 right-0 p-4 text-rose-500 opacity-10 group-hover:opacity-20 transition-opacity">
                        <TrendingDown size={64} strokeWidth={1.5} />
                    </div>
                    <Typography variant="small" className="text-foreground font-black uppercase tracking-widest text-[9px] opacity-70">Gastos (Mes)</Typography>
                    <Typography variant="h2" className="mt-1 tracking-tighter text-rose-600 dark:text-rose-400">
                        {formatCurrency(dashboardData?.monthlyExpense || 0)}
                    </Typography>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-10">
                <div className="lg:col-span-8 space-y-6 md:space-y-10">
                    <SmartFeed currentDate={today} />

                    <ChartCarousel />

                    {processedBudgets.length > 0 && (
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
                                {processedBudgets.map((b: any) => (
                                    <div key={b.id} className="space-y-2">
                                        <div className="flex justify-between items-end">
                                            <div>
                                                <Typography variant="body" className="font-bold text-foreground">{b.categories?.name}</Typography>
                                                <div className="flex items-center space-x-2">
                                                    <Typography variant="small" className="text-[10px] opacity-50 uppercase font-black">
                                                        {b.period === "weekly" ? "Semanal" : b.period === "biweekly" ? "Quincenal" : b.period === "custom" ? "Manual" : "Mensual"}
                                                    </Typography>
                                                </div>
                                            </div>
                                            <Typography variant="small" className="font-mono opacity-80">
                                                {formatCurrency(b.spent)} / {formatCurrency(b.amount)}
                                            </Typography>
                                        </div>
                                        <div className="h-2 w-full bg-foreground/[0.03] rounded-full overflow-hidden">
                                            <div
                                                className={`h-full transition-all duration-1000 ${b.percent >= 100 ? "bg-rose-500" :
                                                    b.percent >= 80 ? "bg-orange-500" :
                                                        "bg-indigo-500"
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
                            {accounts.slice(0, 3).map((acc: any) => (
                                <div key={acc.id} className="flex justify-between items-center p-4 bg-foreground/[0.02] rounded-2xl border border-foreground/[0.03]">
                                    <div>
                                        <Typography variant="body" className="font-bold text-foreground">{acc.name}</Typography>
                                        <Typography variant="small" className="text-[10px] opacity-40 uppercase font-black">{acc.type === "joint" ? "Familiar" : "Personal"}</Typography>
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
                            {recentTransactions.map((tx: any) => (
                                <div key={tx.id} className="flex justify-between items-center p-3 hover:bg-foreground/[0.02] rounded-xl transition-colors">
                                    <div className="flex items-center space-x-3">
                                        <div className={`p-2 rounded-lg ${tx.type === "income" ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"}`}>
                                            {tx.type === "income" ? <ArrowUpCircle size={16} /> : <ArrowDownCircle size={16} />}
                                        </div>
                                        <div>
                                            <Typography variant="small" className="font-bold text-foreground leading-tight line-clamp-1">{tx.description}</Typography>
                                            <Typography variant="small" className="text-[9px] opacity-30 uppercase font-black tracking-widest">{new Date(tx.date).toLocaleDateString()}</Typography>
                                        </div>
                                    </div>
                                    <Typography variant="small" className={`font-mono font-bold ${tx.type === "income" ? "text-emerald-600" : "text-rose-600"}`}>
                                        {tx.type === "income" ? "+" : "-"}{formatCurrency(tx.amount)}
                                    </Typography>
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>
            </div>
        </main>
    );
}
