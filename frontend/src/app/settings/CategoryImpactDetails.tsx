'use client'

import { Typography } from '@/components/ui/atoms/Typography'
import { formatCurrency } from '@/utils/format'
import {
    ArrowRightLeft, CalendarDays, Landmark, Package, Receipt, Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type {
    CategoryAffected,
    CategoryImpactCounts,
    ImpactBudget,
    ImpactDebt,
    ImpactItem,
    ImpactTransaction,
} from '@/lib/api/categories.api'

/** El backend trunca cada lista a 50 registros (contrato §1). */
const MAX_LISTED = 50

const MONTHS = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

const TRANSACTION_TYPE_LABEL: Record<string, string> = {
    expense: 'Gasto',
    income: 'Ingreso',
    transfer: 'Transferencia',
}

const DEBT_TYPE_LABEL: Record<string, string> = {
    to_pay: 'Debo pagar',
    to_receive: 'Me deben',
}

/** `2026-10-20` → «20 octubre 2026». Tolera timestamps ISO. */
function formatDate(value?: string | null) {
    if (!value) return 'Sin fecha'
    const [year, month, day] = value.slice(0, 10).split('-').map(Number)
    if (!year || !month || !day) return value
    return `${day} ${MONTHS[month - 1]} ${year}`
}

/** Etiqueta legible del periodo de un presupuesto. */
function budgetPeriodLabel(budget: ImpactBudget) {
    const year = budget.year ?? new Date().getFullYear()
    if (budget.period === 'weekly') {
        return budget.week_number
            ? `Semanal · semana ${budget.week_number} de ${year}`
            : `Semanal · ${year}`
    }
    return budget.month
        ? `Mensual · ${MONTHS[budget.month - 1]} de ${year}`
        : `Mensual · ${year}`
}

/** Resumen con los 4 tipos y su número. */
export function ImpactSummaryTiles({ counts }: { counts: CategoryImpactCounts }) {
    const tiles: { label: string; value: number; icon: LucideIcon }[] = [
        { label: 'Movimientos', value: counts.transactions, icon: Receipt },
        { label: 'Presupuestos', value: counts.budgets, icon: Landmark },
        { label: 'Productos', value: counts.items, icon: Package },
        { label: 'Deudas', value: counts.debts, icon: Wallet },
    ]

    return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {tiles.map(({ label, value, icon: Icon }) => (
                <div
                    key={label}
                    className="rounded-2xl border border-foreground/10 bg-card p-3 text-center"
                >
                    <Icon size={14} className="mx-auto mb-1 text-muted-foreground" />
                    <p className="text-xl font-black text-foreground">{value}</p>
                    <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                        {label}
                    </p>
                </div>
            ))}
        </div>
    )
}

function GroupHeader({
    icon: Icon,
    label,
    shown,
    total,
}: {
    icon: LucideIcon
    label: string
    shown: number
    total: number
}) {
    const truncated = total > shown

    return (
        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-foreground/[0.03] border-b border-foreground/5">
            <div className="flex items-center gap-2 min-w-0">
                <Icon size={14} className="shrink-0 text-muted-foreground" />
                <Typography variant="small" className="text-muted-foreground truncate">
                    {label}
                </Typography>
                <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10px] font-black text-muted-foreground">
                    {total}
                </span>
            </div>
            {truncated && (
                <span className="shrink-0 text-[10px] font-bold text-amber-600">
                    Mostrando {shown} de {total}
                </span>
            )}
        </div>
    )
}

/**
 * Lista desplazable con los registros afectados, agrupados por tipo.
 *
 * Muestra lo legible para una persona: movimiento (descripción, monto, fecha),
 * presupuesto (monto, periodo, mes/año), producto (nombre, cantidad, monto y
 * el movimiento al que pertenece) y deuda (descripción, total, saldo y
 * vencimiento).
 */
export function AffectedRecordsList({
    affected,
    counts,
}: {
    affected?: CategoryAffected | null
    counts?: CategoryImpactCounts | null
}) {
    const transactions = affected?.transactions ?? []
    const budgets = affected?.budgets ?? []
    const items = affected?.items ?? []
    const debts = affected?.debts ?? []

    const listed = transactions.length + budgets.length + items.length + debts.length
    if (listed === 0) return null

    const isTruncated =
        (counts?.transactions ?? 0) > transactions.length ||
        (counts?.budgets ?? 0) > budgets.length ||
        (counts?.items ?? 0) > items.length ||
        (counts?.debts ?? 0) > debts.length

    return (
        <div className="space-y-3">
            {isTruncated && (
                <div className="flex items-start gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2">
                    <CalendarDays size={14} className="mt-0.5 shrink-0 text-amber-600" />
                    <Typography variant="muted" className="text-amber-700 dark:text-amber-300">
                        Se muestra un resumen: hasta {MAX_LISTED} registros por tipo. Los totales de
                        arriba sí son los reales.
                    </Typography>
                </div>
            )}

            <div className="max-h-64 overflow-y-auto rounded-2xl border border-foreground/10 bg-card">
                {transactions.length > 0 && (
                    <div>
                        <GroupHeader
                            icon={Receipt}
                            label="Movimientos"
                            shown={transactions.length}
                            total={counts?.transactions ?? transactions.length}
                        />
                        <ul className="divide-y divide-foreground/5">
                            {transactions.map((t: ImpactTransaction) => (
                                <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-foreground">
                                            {t.description || 'Sin descripción'}
                                        </p>
                                        <p className="text-[11px] text-muted-foreground">
                                            {formatDate(t.date)}
                                            {t.type ? ` · ${TRANSACTION_TYPE_LABEL[t.type] ?? t.type}` : ''}
                                        </p>
                                    </div>
                                    <p className="shrink-0 text-sm font-bold text-foreground whitespace-nowrap">
                                        {formatCurrency(Number(t.amount))}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {budgets.length > 0 && (
                    <div className="border-t border-foreground/5">
                        <GroupHeader
                            icon={Landmark}
                            label="Presupuestos"
                            shown={budgets.length}
                            total={counts?.budgets ?? budgets.length}
                        />
                        <ul className="divide-y divide-foreground/5">
                            {budgets.map((b: ImpactBudget) => (
                                <li key={b.id} className="flex items-center justify-between gap-3 px-3 py-2">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-foreground">
                                            {budgetPeriodLabel(b)}
                                        </p>
                                        <p className="text-[11px] text-muted-foreground">
                                            {b.user_id ? 'Presupuesto personal' : 'Presupuesto compartido'}
                                        </p>
                                    </div>
                                    <p className="shrink-0 text-sm font-bold text-foreground whitespace-nowrap">
                                        {formatCurrency(Number(b.amount))}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {items.length > 0 && (
                    <div className="border-t border-foreground/5">
                        <GroupHeader
                            icon={Package}
                            label="Productos"
                            shown={items.length}
                            total={counts?.items ?? items.length}
                        />
                        <ul className="divide-y divide-foreground/5">
                            {items.map((item: ImpactItem) => (
                                <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-foreground">
                                            {item.item_name || 'Producto sin nombre'}
                                        </p>
                                        <p className="truncate text-[11px] text-muted-foreground">
                                            × {Number(item.quantity)} ·{' '}
                                            {item.transaction_description || 'Movimiento sin descripción'}
                                        </p>
                                    </div>
                                    <p className="shrink-0 text-sm font-bold text-foreground whitespace-nowrap">
                                        {formatCurrency(Number(item.total_price))}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {debts.length > 0 && (
                    <div className="border-t border-foreground/5">
                        <GroupHeader
                            icon={Wallet}
                            label="Deudas"
                            shown={debts.length}
                            total={counts?.debts ?? debts.length}
                        />
                        <ul className="divide-y divide-foreground/5">
                            {debts.map((debt: ImpactDebt) => (
                                <li key={debt.id} className="flex items-center justify-between gap-3 px-3 py-2">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-foreground">
                                            {debt.description || 'Sin descripción'}
                                        </p>
                                        <p className="text-[11px] text-muted-foreground">
                                            {DEBT_TYPE_LABEL[debt.type] ?? debt.type} · vence{' '}
                                            {formatDate(debt.due_date)}
                                        </p>
                                    </div>
                                    <div className="shrink-0 text-right whitespace-nowrap">
                                        <p className="text-sm font-bold text-foreground">
                                            {formatCurrency(Number(debt.remaining_amount))}
                                        </p>
                                        <p className="text-[10px] text-muted-foreground">
                                            de {formatCurrency(Number(debt.total_amount))}
                                        </p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            <div className="flex items-start gap-2 rounded-2xl border border-foreground/10 bg-foreground/[0.03] px-3 py-2">
                <ArrowRightLeft size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
                <Typography variant="muted" className="text-muted-foreground">
                    Para corregir el producto de una factura uno por uno, usa el panel «Productos» de
                    la factura en la pantalla de Movimientos.
                </Typography>
            </div>
        </div>
    )
}
