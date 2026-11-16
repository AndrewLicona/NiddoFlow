"use client";

import { useDashboard } from "@/hooks/useDashboard";
import { useAccounts } from "@/hooks/useAccounts";
import { useTransactions } from "@/hooks/useTransactions";
import { useBudgets } from "@/hooks/useBudgets";
import { useInsights } from "@/hooks/useInsights";
import { formatCurrency } from "@/utils/format";
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
    FileText,
    ArrowLeftRight
} from "lucide-react";
import Link from "next/link";
import ChartCarousel from "./ChartCarousel";
import SmartFeed from "./SmartFeed";
import IntelligenceCenter from "./IntelligenceCenter";
import { budgetPeriodLabel, isBudgetActiveNow } from "@/app/dashboard/lib/budgetPeriod";
import OnboardingTour from "@/components/ui/organisms/OnboardingTour";
import React, { useMemo } from "react";
import { DashboardSkeleton } from "@/components/ui/molecules/SkeletonLoaders";

interface DashboardClientProps {
    user: any;
    profile: any;
}

export default function DashboardClient({ user, profile }: DashboardClientProps) {
    const { preparedData: dashboardData, isLoading: statsLoading, error: statsError } = useDashboard();
    const { accounts, isLoading: accountsLoading, error: accountsError } = useAccounts();
    const { transactions: recentTransactions, isLoading: transactionsLoading, error: transactionsError } = useTransactions({ limit: 5 });
    const { budgets } = useBudgets();
    const { totals: insightTotals } = useInsights();

    const [today, setToday] = React.useState<Date | null>(null);

    React.useEffect(() => {
        setToday(new Date());
    }, []);

    /**
     * Totales del mes: los manda el servidor (`/insights`), que es la misma
     * fuente que usan presupuestos, gráficos y el resto de la app.
     * Mientras llegan (o si el endpoint falla) se usa el resumen del dashboard.
     */
    const monthlyIncome = insightTotals?.income ?? dashboardData?.monthlyIncome ?? 0;
    const monthlyExpense = insightTotals?.expense ?? dashboardData?.monthlyExpense ?? 0;

    // Data processing logic moved here
    const processedBudgets = useMemo(() => {
        if (!today || !budgets) return [];

        // `spent`, `percent` y `status` los calcula el servidor ya acotados al
        // período de cada presupuesto (fuente de verdad: `budget_period.py`).
        // Aquí solo se filtra cuáles presupuestos son los del período actual.
        return budgets
            .filter((b: any) => isBudgetActiveNow(b, today))
            .map((b: any) => {
                const spent = Number(b.spent ?? 0);
                const percent = Number(b.percent ?? 0);
                // El `status` lo manda el servidor; el fallback solo se usa si
                // un backend antiguo no lo devuelve (mismos umbrales del contrato).
                const status =
                    b.status ?? (percent >= 100 ? "critical" : percent >= 80 ? "warning" : "ok");
                return { ...b, spent, percent, status };
            });
    }, [budgets, today]);


    const displayName = user.user_metadata?.full_name || profile.full_name || user.email;

    // Use a lighter condition for the main page skeleton
    // If we have stats and accounts, we can show the main layout
    const isMainDataLoading = statsLoading || accountsLoading;

    if (isMainDataLoading) {
        return <DashboardSkeleton />;
    }

    return (
        <main className="max-w-6xl mx-auto p-4 md:p-8 pt-10 md:pt-8 space-y-6 md:space-y-10 min-h-screen pb-24">
            <OnboardingTour startTour={!profile.onboarding_completed} />

            <PageHeader
                title={`Hola, ${displayName?.split(" ")[0]}`}
                description="Tu dinero y tus movimientos, de un vistazo."
                showProfile
                userProfile={profile}
                actions={
                    <div className="flex gap-2">
                        <Link href="/reports" className="inline-flex h-11 items-center gap-2 rounded-xl border border-foreground/10 px-4 text-sm font-bold text-foreground/70 transition-colors hover:bg-foreground/5">
                            <FileText size={17} /> Reportes
                        </Link>
                        <Link href="/transactions/new" className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-md transition-opacity hover:opacity-90">
                            <Plus size={18} /> Añadir movimiento
                        </Link>
                    </div>
                }
            />

            {statsError && (
                <div role="alert" className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-foreground">
                    No pudimos cargar el resumen financiero. Comprueba tu conexión y vuelve a intentarlo.
                </div>
            )}

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-8">
                <Card variant="elevated" className="col-span-2 md:col-span-1 relative overflow-hidden group bg-indigo-600 dark:bg-indigo-900 shadow-indigo-500/20 border-none">
                    <div className="absolute top-0 right-0 p-4 text-white opacity-10 group-hover:opacity-20 transition-opacity">
                        <Wallet size={64} strokeWidth={1.5} />
                    </div>
                    <Typography variant="small" className="text-white font-black uppercase tracking-widest text-[9px] opacity-60">Balance Total</Typography>
                    <Typography variant="h1" className="mt-1 tracking-tighter text-white">
                        {statsError ? "—" : formatCurrency(dashboardData?.totalBalance || 0)}
                    </Typography>
                </Card>
                <Card variant="elevated" className="relative overflow-hidden group border-emerald-500/10">
                    <div className="absolute top-0 right-0 p-4 text-emerald-500 opacity-10 group-hover:opacity-20 transition-opacity">
                        <TrendingUp size={64} strokeWidth={1.5} />
                    </div>
                    <Typography variant="small" className="text-foreground font-black uppercase tracking-widest text-[9px] opacity-70">Ingresos (Mes)</Typography>
                    <Typography variant="h2" className="mt-1 tracking-tighter text-emerald-600 dark:text-emerald-400">
                        {statsError && !insightTotals ? "—" : formatCurrency(monthlyIncome)}
                    </Typography>
                </Card>
                <Card variant="elevated" className="relative overflow-hidden group border-rose-500/10">
                    <div className="absolute top-0 right-0 p-4 text-rose-500 opacity-10 group-hover:opacity-20 transition-opacity">
                        <TrendingDown size={64} strokeWidth={1.5} />
                    </div>
                    <Typography variant="small" className="text-foreground font-black uppercase tracking-widest text-[9px] opacity-70">Gastos (Mes)</Typography>
                    <Typography variant="h2" className="mt-1 tracking-tighter text-rose-600 dark:text-rose-400">
                        {statsError && !insightTotals ? "—" : formatCurrency(monthlyExpense)}
                    </Typography>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-10">
                <div className="lg:col-span-8 space-y-6 md:space-y-10">
                    <SmartFeed currentDate={today} />

                    <IntelligenceCenter />

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
                                                        {budgetPeriodLabel(b)}
                                                    </Typography>
                                                </div>
                                            </div>
                                            <Typography variant="small" className="font-mono opacity-80">
                                                {formatCurrency(b.spent)} / {formatCurrency(b.amount)}
                                            </Typography>
                                        </div>
                                        <div className="h-2 w-full bg-foreground/[0.03] rounded-full overflow-hidden">
                                            <div
                                                className={`h-full transition-all duration-1000 ${b.status === "critical" ? "bg-rose-500" :
                                                    b.status === "warning" ? "bg-orange-500" :
                                                        "bg-indigo-500"
                                                    }`}
                                                style={{ width: `${Math.min(100, b.percent)}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}
                </div>

                <div className="lg:col-span-4 flex flex-col gap-6 md:gap-10">
                    <Card variant="elevated" className="order-2">
                        <div className="flex justify-between items-center mb-6">
                            <Typography variant="h3" className="text-foreground font-black">Mis Cuentas</Typography>
                            <Link href="/accounts">
                                <Button variant="ghost" size="sm" className="text-foreground/30 hover:text-blue-600">
                                    Ver todas
                                </Button>
                            </Link>
                        </div>
                        <div className="space-y-4">
                            {accountsError ? (
                                <p className="text-sm text-foreground/60">No pudimos cargar tus cuentas.</p>
                            ) : accounts.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-foreground/10 p-4 text-sm text-foreground/60">
                                    <p>Aún no tienes cuentas registradas.</p>
                                    <Link href="/accounts/new" className="mt-2 inline-block font-bold text-blue-600 hover:underline">Añadir cuenta</Link>
                                </div>
                            ) : null}
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

                    <Card variant="elevated" className="order-1">
                        <div className="flex justify-between items-center mb-6">
                            <Typography variant="h3" className="text-foreground font-black">Actividad Reciente</Typography>
                            <Link href="/transactions" aria-label="Ver todos los movimientos">
                                <LucideHistory size={18} className="text-foreground/30 hover:text-blue-600 transition-colors" />
                            </Link>
                        </div>
                        <div className="space-y-4">
                            {transactionsError ? (
                                <p className="text-sm text-foreground/60">No pudimos cargar los movimientos recientes.</p>
                            ) : !transactionsLoading && recentTransactions.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-foreground/10 p-4 text-sm text-foreground/60">
                                    <p>Aún no hay movimientos recientes.</p>
                                    <Link href="/transactions/new" className="mt-2 inline-block font-bold text-blue-600 hover:underline">Registrar movimiento</Link>
                                </div>
                            ) : null}
                            {recentTransactions.map((tx: any) => (
                                <div key={tx.id} className="flex justify-between items-center p-3 hover:bg-foreground/[0.02] rounded-xl transition-colors">
                                    <div className="flex items-center space-x-3">
                                        <div className={`p-2 rounded-lg ${tx.type === "income" ? "bg-emerald-500/10 text-emerald-600" : tx.type === "transfer" ? "bg-blue-500/10 text-blue-600" : "bg-rose-500/10 text-rose-600"}`}>
                                            {tx.type === "income" ? <ArrowUpCircle size={16} /> : tx.type === "transfer" ? <ArrowLeftRight size={16} /> : <ArrowDownCircle size={16} />}
                                        </div>
                                        <div>
                                            <Typography variant="small" className="font-bold text-foreground leading-tight line-clamp-1">{tx.description}</Typography>
                                            <Typography variant="small" className="text-[9px] opacity-30 uppercase font-black tracking-widest">{new Date(tx.date).toLocaleDateString()}</Typography>
                                        </div>
                                    </div>
                                    <Typography variant="small" className={`font-mono font-bold ${tx.type === "income" ? "text-emerald-600" : tx.type === "transfer" ? "text-blue-600" : "text-rose-600"}`}>
                                        {tx.type === "income" ? "+" : tx.type === "expense" ? "-" : ""}{formatCurrency(tx.amount)}
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
