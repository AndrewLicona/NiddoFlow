'use client'

import { useMemo } from 'react'
import {
    AlertTriangle,
    Brain,
    CalendarClock,
    Info,
    Loader2,
    Repeat,
    Sparkles,
    TriangleAlert,
    Users,
} from 'lucide-react'

import { Typography } from '@/components/ui/atoms/Typography'
import { Card } from '@/components/ui/molecules/Card'
import { useInsights } from '@/hooks/useInsights'
import { monthlyEquivalent, type AnomalySeverity, type RecurringCadence } from '@/lib/api/insights.api'
import { formatCurrency } from '@/utils/format'

/** Por debajo de este margen de días de gasto, la proyección se resalta. */
const MARGIN_DAYS_ALERT = 10

const CADENCE_LABELS: Record<RecurringCadence, string> = {
    weekly: 'Semanal',
    biweekly: 'Quincenal',
    monthly: 'Mensual',
    quarterly: 'Trimestral',
    yearly: 'Anual',
}

const SEVERITY_STYLES: Record<AnomalySeverity, { card: string; icon: string }> = {
    critical: {
        card: 'bg-rose-50 dark:bg-rose-900/10 border-rose-100 dark:border-rose-900/30',
        icon: 'text-rose-500',
    },
    warning: {
        card: 'bg-amber-50 dark:bg-amber-900/10 border-amber-100 dark:border-amber-900/30',
        icon: 'text-amber-500',
    },
    info: {
        card: 'bg-blue-50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-900/30',
        icon: 'text-blue-500',
    },
}

/**
 * Centro de Inteligencia del dashboard.
 *
 * Todo lo que se muestra aquí viene de `GET /insights` (el servidor calcula):
 * suscripciones recurrentes, proyección de flujo de caja, anomalías detectadas
 * y gasto por miembro. El cliente solo renderiza.
 */
export default function IntelligenceCenter() {
    const { recurring, anomalies, cashflow, byMember, month, isLoading, isError } = useInsights()

    const recurringRows = useMemo(
        () =>
            recurring.map((item) => ({
                ...item,
                monthly: monthlyEquivalent(item.amount, item.cadence),
            })),
        [recurring]
    )

    const recurringTotal = useMemo(
        () => recurringRows.reduce((acc, item) => acc + item.monthly, 0),
        [recurringRows]
    )

    const marginIsLow =
        cashflow !== null && cashflow.days_of_expense_remaining < MARGIN_DAYS_ALERT

    if (isLoading) {
        return (
            <Card variant="elevated" className="flex items-center justify-center min-h-[220px]">
                <Loader2 className="animate-spin text-indigo-600" size={28} />
            </Card>
        )
    }

    return (
        <section className="w-full space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2">
                    <Brain className="text-indigo-500" size={18} />
                    <Typography variant="small" className="text-foreground/70 font-black uppercase tracking-widest text-[10px]">
                        Centro de Inteligencia
                    </Typography>
                </div>
                <Typography variant="small" className="text-foreground/40 font-black uppercase tracking-widest text-[10px]">
                    {month}
                </Typography>
            </div>

            {isError && (
                <div className="flex items-center gap-3 p-4 rounded-2xl border border-amber-100 dark:border-amber-900/30 bg-amber-50/50 dark:bg-amber-900/10">
                    <Info size={18} className="text-amber-500 shrink-0" />
                    <Typography variant="small" className="text-amber-700 dark:text-amber-300 font-bold uppercase tracking-wide">
                        No pudimos calcular los insights ahora mismo.
                    </Typography>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                {/* ---------------------------------------------------------- */}
                {/* Suscripciones / gastos recurrentes                          */}
                {/* ---------------------------------------------------------- */}
                <Card variant="elevated" className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <Repeat size={18} className="text-blue-500" />
                            <Typography variant="h3" className="text-foreground font-black">Suscripciones y recurrentes</Typography>
                        </div>
                        {recurringTotal > 0 && (
                            <div className="text-right">
                                <Typography variant="small" className="text-foreground/40 font-black uppercase tracking-widest text-[9px]">
                                    Total al mes
                                </Typography>
                                <Typography variant="body" className="font-mono font-bold text-blue-600 dark:text-blue-400">
                                    {formatCurrency(recurringTotal)}
                                </Typography>
                            </div>
                        )}
                    </div>

                    {recurringRows.length === 0 ? (
                        <EmptyHint text="Aún no detectamos pagos que se repitan mes a mes." />
                    ) : (
                        <ul className="space-y-3">
                            {recurringRows.map((item) => (
                                <li
                                    key={`${item.merchant}-${item.cadence}`}
                                    className="flex items-center justify-between gap-3 p-3 bg-foreground/[0.02] rounded-xl border border-foreground/[0.03]"
                                >
                                    <div className="min-w-0">
                                        <Typography variant="body" className="font-bold text-foreground truncate">
                                            {item.merchant}
                                        </Typography>
                                        <Typography variant="small" className="text-[9px] opacity-40 uppercase font-black tracking-widest">
                                            {CADENCE_LABELS[item.cadence] ?? item.cadence}
                                            {item.last_seen ? ` · ${item.last_seen}` : ''}
                                        </Typography>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <Typography variant="body" className="font-mono font-bold text-foreground">
                                            {formatCurrency(item.monthly)}
                                        </Typography>
                                        <Typography variant="small" className="text-[9px] opacity-40 uppercase font-black tracking-widest">
                                            Variación {Math.round(item.confidence * 100)}%
                                        </Typography>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </Card>

                {/* ---------------------------------------------------------- */}
                {/* Proyección de flujo de caja                                  */}
                {/* ---------------------------------------------------------- */}
                <Card
                    variant="elevated"
                    className={`space-y-4 ${marginIsLow ? 'border-amber-500/30' : ''}`}
                >
                    <div className="flex items-center gap-2">
                        <CalendarClock size={18} className={marginIsLow ? 'text-amber-500' : 'text-emerald-500'} />
                        <Typography variant="h3" className="text-foreground font-black">Proyección de flujo de caja</Typography>
                    </div>

                    {!cashflow ? (
                        <EmptyHint text="Sin datos de flujo de caja para este mes." />
                    ) : (
                        <>
                            <div
                                className={`p-4 rounded-xl border ${
                                    marginIsLow
                                        ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-100 dark:border-amber-900/30'
                                        : 'bg-foreground/[0.02] border-foreground/[0.05]'
                                }`}
                            >
                                <Typography variant="small" className="text-foreground/40 font-black uppercase tracking-widest text-[9px]">
                                    Saldo proyectado a fin de mes
                                </Typography>
                                <Typography
                                    variant="h2"
                                    className={`tracking-tight ${cashflow.projected_end_of_month < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}
                                >
                                    {formatCurrency(cashflow.projected_end_of_month)}
                                </Typography>
                                {marginIsLow && (
                                    <Typography variant="small" className="mt-2 block text-amber-700 dark:text-amber-300 font-bold uppercase tracking-wide">
                                        Margen ajustado: quedan {cashflow.days_of_expense_remaining.toFixed(1)} días de gasto
                                    </Typography>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-3 bg-foreground/[0.02] rounded-xl border border-foreground/[0.05]">
                                    <Typography variant="small" className="text-foreground/40 font-black uppercase tracking-widest text-[9px]">
                                        Gasto diario promedio
                                    </Typography>
                                    <Typography variant="body" className="font-mono font-bold text-foreground">
                                        {formatCurrency(cashflow.daily_avg_spend)}
                                    </Typography>
                                </div>
                                <div className="p-3 bg-foreground/[0.02] rounded-xl border border-foreground/[0.05]">
                                    <Typography variant="small" className="text-foreground/40 font-black uppercase tracking-widest text-[9px]">
                                        Días de margen
                                    </Typography>
                                    <Typography
                                        variant="body"
                                        className={`font-mono font-bold ${marginIsLow ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'}`}
                                    >
                                        {cashflow.days_of_expense_remaining.toFixed(1)} días
                                    </Typography>
                                </div>
                            </div>
                        </>
                    )}
                </Card>

                {/* ---------------------------------------------------------- */}
                {/* Anomalías                                                   */}
                {/* ---------------------------------------------------------- */}
                <Card variant="elevated" className="space-y-4">
                    <div className="flex items-center gap-2">
                        <TriangleAlert size={18} className="text-amber-500" />
                        <Typography variant="h3" className="text-foreground font-black">Anomalías detectadas</Typography>
                    </div>

                    {anomalies.length === 0 ? (
                        <EmptyHint text="No encontramos gastos fuera de lo habitual." />
                    ) : (
                        <ul className="space-y-2">
                            {anomalies.map((anomaly, index) => {
                                const style = SEVERITY_STYLES[anomaly.severity] ?? SEVERITY_STYLES.info
                                return (
                                    <li
                                        key={`${anomaly.kind}-${index}`}
                                        className={`flex items-start gap-3 p-3 rounded-xl border ${style.card}`}
                                    >
                                        <AlertTriangle size={16} className={`${style.icon} shrink-0 mt-0.5`} />
                                        <div className="min-w-0">
                                            <Typography variant="small" className="font-black uppercase tracking-widest text-[9px] opacity-70">
                                                {anomaly.category}
                                            </Typography>
                                            <Typography variant="body" className="text-sm font-medium leading-snug">
                                                {anomaly.message}
                                            </Typography>
                                        </div>
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                </Card>

                {/* ---------------------------------------------------------- */}
                {/* Gasto por miembro                                           */}
                {/* ---------------------------------------------------------- */}
                <Card variant="elevated" className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Users size={18} className="text-emerald-500" />
                        <Typography variant="h3" className="text-foreground font-black">Gasto por miembro</Typography>
                    </div>

                    {byMember.length === 0 ? (
                        <EmptyHint text="Todavía no hay gastos asignados a un integrante." />
                    ) : (
                        <ul className="space-y-3">
                            {byMember.map((member, index) => {
                                const isTop = index === 0
                                return (
                                    <li key={member.user_id ?? `sin-asignar-${index}`} className="space-y-1.5">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <Typography variant="body" className="font-bold text-foreground truncate">
                                                    {member.member}
                                                </Typography>
                                                {isTop && (
                                                    <span className="shrink-0 text-[9px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                                                        Gastó más
                                                    </span>
                                                )}
                                            </div>
                                            <Typography variant="body" className="font-mono font-bold text-foreground shrink-0">
                                                {formatCurrency(member.amount)}
                                            </Typography>
                                        </div>
                                        <div className="h-1.5 w-full bg-foreground/[0.05] rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-emerald-500 transition-all duration-1000"
                                                style={{
                                                    width: `${Math.min(
                                                        100,
                                                        (member.amount / (byMember[0]?.amount || 1)) * 100
                                                    )}%`,
                                                }}
                                            />
                                        </div>
                                        <Typography variant="small" className="text-[9px] opacity-40 uppercase font-black tracking-widest">
                                            {member.transaction_count} movimientos
                                        </Typography>
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                </Card>
            </div>
        </section>
    )
}

function EmptyHint({ text }: { text: string }) {
    return (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-dashed border-foreground/10 bg-foreground/[0.01]">
            <Sparkles size={16} className="text-foreground/25 shrink-0" />
            <Typography variant="muted" className="text-foreground/45">
                {text}
            </Typography>
        </div>
    )
}
