'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { leaveFamily } from './actions'
import { Typography } from '@/components/ui/atoms/Typography'
import { Button } from '@/components/ui/atoms/Button'
import { Card } from '@/components/ui/molecules/Card'
import { InputField } from '@/components/ui/molecules/InputField'
import { useCategories, useCategoryImpact, useReassignCategory } from '@/hooks/useCategories'
import type { Category, CategoryWarnings } from '@/lib/api/categories.api'
import { AffectedRecordsList, ImpactSummaryTiles } from './CategoryImpactDetails'
import {
    Home, Link as LinkIcon, Copy, Check, Users, LogOut, AlertTriangle, Palette, Moon, Sun, Monitor,
    Leaf, Droplets, Sunset, Plus, Pencil, Trash2, Shapes, Tags, Loader2, ArrowRightLeft, ChevronDown
} from 'lucide-react'
import { selectStyles } from '@/components/ui/molecules/SelectField'
import type { LucideIcon } from 'lucide-react'
import {
    UtensilsCrossed, Car, House, ShoppingCart, HeartPulse, Film, Dumbbell, GraduationCap, Scissors,
    PawPrint, Baby, Shirt, Gift, Zap, Fuel, Bus, Plane, CreditCard, Wallet, PiggyBank, Banknote,
    Receipt, Coffee, Wine, Apple, Soup, Wrench, Hammer, Laptop, Smartphone, BookOpen, Stethoscope,
    Pill, Brush, PartyPopper
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { useColorPalette } from '@/components/providers/ColorPaletteProvider'

type FamilyData = {
    id: string
    name: string
    invite_code: string | null
}

type Member = {
    id: string
    full_name: string | null
    email: string
}

/** Catálogo de iconos frecuentes (nombres estándar de lucide-react). */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
    UtensilsCrossed, Car, House, ShoppingCart, HeartPulse, Film, Dumbbell, GraduationCap, Scissors,
    PawPrint, Baby, Shirt, Gift, Zap, Fuel, Bus, Plane, CreditCard, Wallet, PiggyBank, Banknote,
    Receipt, Coffee, Wine, Apple, Soup, Wrench, Hammer, Laptop, Smartphone, BookOpen, Stethoscope,
    Pill, Brush, PartyPopper
}

const CATEGORY_ICON_NAMES = Object.keys(CATEGORY_ICONS)

const DEFAULT_CATEGORY_ICON = 'UtensilsCrossed'

function renderCategoryIcon(icon?: string | null, className = 'h-4 w-4') {
    const Icon = (icon && CATEGORY_ICONS[icon]) || Shapes
    return <Icon className={className} />
}

/** Rejilla de iconos para elegir el de una categoría. */
function IconPicker({
    value,
    onSelect,
}: {
    value?: string | null
    onSelect: (icon: string) => void
}) {
    return (
        <div className="grid grid-cols-6 sm:grid-cols-9 gap-2 p-3 rounded-2xl border border-foreground/10 bg-card">
            {CATEGORY_ICON_NAMES.map((iconName) => {
                const Icon = CATEGORY_ICONS[iconName]
                const selected = value === iconName
                return (
                    <button
                        key={iconName}
                        type="button"
                        title={iconName}
                        onClick={() => onSelect(iconName)}
                        className={`h-9 w-9 rounded-xl flex items-center justify-center transition-all ${
                            selected
                                ? 'bg-primary text-primary-foreground shadow-sm'
                                : 'bg-foreground/[0.03] text-foreground/60 hover:bg-foreground/[0.08] hover:text-foreground'
                        }`}
                    >
                        <Icon size={16} />
                    </button>
                )
            })}
        </div>
    )
}

/**
 * Pestaña "Categorías": CRUD de las categorías propias de la familia.
 * Las del sistema se muestran con badge "Sistema" y no se pueden modificar.
 */
function CategoriesPanel() {
    const { categories, isLoading, error, createCategory, updateCategory, deleteCategory } = useCategories()

    const [name, setName] = useState('')
    const [type, setType] = useState<'income' | 'expense'>('expense')
    const [icon, setIcon] = useState(DEFAULT_CATEGORY_ICON)
    const [showIcons, setShowIcons] = useState(false)
    const [formError, setFormError] = useState('')
    const [isBusy, setIsBusy] = useState(false)

    const [editingId, setEditingId] = useState<string | null>(null)
    const [editName, setEditName] = useState('')
    const [editIcon, setEditIcon] = useState<string | null>(null)
    const [showEditIcons, setShowEditIcons] = useState(false)

    const [pendingDelete, setPendingDelete] = useState<Category | null>(null)
    const [deleteResult, setDeleteResult] = useState<{ warnings?: CategoryWarnings } | null>(null)
    const [deleteError, setDeleteError] = useState('')

    /** Destino elegido para mover los registros antes de borrar. */
    const [targetCategoryId, setTargetCategoryId] = useState('')
    const [reassignError, setReassignError] = useState('')
    const [reassignNotice, setReassignNotice] = useState('')

    const impactQuery = useCategoryImpact(pendingDelete?.id)
    const reassignCategory = useReassignCategory()

    const impact = impactQuery.data
    const counts = impact?.counts
    const affected = impact
        ? {
            transactions: impact.transactions ?? [],
            budgets: impact.budgets ?? [],
            items: impact.items ?? [],
            debts: impact.debts ?? [],
        }
        : null
    const affectedTotal = counts
        ? counts.transactions + counts.budgets + counts.items + counts.debts
        : 0

    /** Solo se puede mover a una categoría del mismo tipo (gasto→gasto, ingreso→ingreso). */
    const sourceType = pendingDelete?.type
    const targetCategories = sourceType
        ? categories.filter((c) => c.id !== pendingDelete?.id && c.type === sourceType)
        : []

    const isSystem = (category: Category) => category.is_default === true

    const startEdit = (category: Category) => {
        setEditingId(category.id)
        setEditName(category.name)
        setEditIcon(category.icon ?? null)
        setShowEditIcons(false)
        setFormError('')
    }

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        const trimmed = name.trim()
        if (!trimmed) {
            setFormError('Escribe un nombre para la categoría.')
            return
        }
        setFormError('')
        setIsBusy(true)
        try {
            await createCategory.mutateAsync({ name: trimmed, type, icon })
            setName('')
            setIcon(DEFAULT_CATEGORY_ICON)
            setShowIcons(false)
        } catch (err) {
            setFormError(err instanceof Error ? err.message : 'No se pudo crear la categoría.')
        } finally {
            setIsBusy(false)
        }
    }

    const handleUpdate = async (id: string) => {
        const trimmed = editName.trim()
        if (!trimmed) {
            setFormError('El nombre de la categoría no puede quedar vacío.')
            return
        }
        setFormError('')
        setIsBusy(true)
        try {
            await updateCategory.mutateAsync({ id, data: { name: trimmed, icon: editIcon } })
            setEditingId(null)
        } catch (err) {
            setFormError(err instanceof Error ? err.message : 'No se pudo actualizar la categoría.')
        } finally {
            setIsBusy(false)
        }
    }

    const handleDelete = async () => {
        if (!pendingDelete) return
        setIsBusy(true)
        setDeleteError('')
        try {
            const result = await deleteCategory.mutateAsync(pendingDelete.id)
            setPendingDelete(null)
            setDeleteResult(result ?? {})
            setTargetCategoryId('')
            setReassignError('')
            setReassignNotice('')
        } catch (err) {
            setDeleteError(err instanceof Error ? err.message : 'No se pudo eliminar la categoría.')
        } finally {
            setIsBusy(false)
        }
    }

    /** Mueve los registros afectados a otra categoría antes de borrar. */
    const handleReassign = async () => {
        if (!pendingDelete || !targetCategoryId) return
        setIsBusy(true)
        setReassignError('')
        setReassignNotice('')
        try {
            const result = await reassignCategory.mutateAsync({
                id: pendingDelete.id,
                targetCategoryId,
            })
            const target = categories.find((c) => c.id === targetCategoryId)
            const moved = result?.moved
            const total = moved
                ? moved.transactions + moved.budgets + moved.items + moved.debts
                : 0
            setReassignNotice(
                `Se movieron ${total} registros a «${target?.name ?? 'la categoría elegida'}». `
                + 'Ahora «' + pendingDelete.name + '» ya no tiene nada asociado y puedes eliminarla.'
            )
            setTargetCategoryId('')
        } catch (err) {
            setReassignError(err instanceof Error ? err.message : 'No se pudieron mover los registros.')
        } finally {
            setIsBusy(false)
        }
    }

    const renderGroup = (title: string, group: Category[]) => (
        <div className="space-y-3">
            <Typography variant="small" className="text-muted-foreground">{title}</Typography>

            {group.length === 0 && (
                <Typography variant="muted" className="text-foreground/40">Todavía no hay categorías aquí.</Typography>
            )}

            {group.map((category) => {
                const system = isSystem(category)

                if (editingId === category.id) {
                    return (
                        <div key={category.id} className="p-4 rounded-2xl border border-primary/20 bg-primary/[0.03] space-y-3">
                            <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                                <div className="flex-1">
                                    <InputField
                                        label="Nombre"
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        placeholder="Ej: Mascotas"
                                    />
                                </div>
                                <div className="sm:w-48">
                                    <InputField
                                        label="Icono"
                                        as="select"
                                        value={editIcon || ''}
                                        onChange={(e) => setEditIcon(e.target.value || null)}
                                    >
                                        <option value="">Sin icono</option>
                                        {CATEGORY_ICON_NAMES.map((iconName) => (
                                            <option key={iconName} value={iconName}>{iconName}</option>
                                        ))}
                                    </InputField>
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowEditIcons((prev) => !prev)}
                                >
                                    <Shapes size={14} className="mr-2" /> {showEditIcons ? 'Ocultar iconos' : 'Ver iconos'}
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                                    Cancelar
                                </Button>
                                <Button variant="primary" size="sm" onClick={() => handleUpdate(category.id)} disabled={isBusy}>
                                    {isBusy ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Check size={14} className="mr-2" />}
                                    Guardar
                                </Button>
                            </div>

                            {showEditIcons && (
                                <IconPicker value={editIcon} onSelect={(selected) => setEditIcon(selected)} />
                            )}
                        </div>
                    )
                }

                return (
                    <div
                        key={category.id}
                        className="flex items-center justify-between gap-3 p-3 rounded-2xl border border-foreground/[0.05] bg-foreground/[0.02] hover:border-foreground/10 transition-colors"
                    >
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="h-9 w-9 shrink-0 rounded-xl bg-card border border-foreground/[0.05] flex items-center justify-center text-foreground/70">
                                {renderCategoryIcon(category.icon)}
                            </div>
                            <div className="min-w-0">
                                <Typography variant="body" className="font-bold text-foreground truncate">
                                    {category.name}
                                </Typography>
                                {system && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                                        <Tags size={10} /> Sistema
                                    </span>
                                )}
                            </div>
                        </div>

                        {!system && (
                            <div className="flex items-center gap-1 shrink-0">
                                <Button variant="ghost" size="sm" onClick={() => startEdit(category)} aria-label={`Editar ${category.name}`}>
                                    <Pencil size={16} />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        setDeleteError('')
                                        setReassignError('')
                                        setReassignNotice('')
                                        setTargetCategoryId('')
                                        setPendingDelete(category)
                                    }}
                                    className="text-rose-500 hover:bg-rose-500/10"
                                    aria-label={`Eliminar ${category.name}`}
                                >
                                    <Trash2 size={16} />
                                </Button>
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
    )

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
            {/* Crear categoría */}
            <Card variant="elevated">
                <div className="flex items-center space-x-3 mb-6">
                    <div className="p-2 bg-blue-500/10 rounded-xl">
                        <Tags size={20} className="text-blue-600" />
                    </div>
                    <div>
                        <Typography variant="h3">Tus categorías</Typography>
                        <Typography variant="muted">Crea las categorías que usa tu familia y elige su ícono.</Typography>
                    </div>
                </div>

                {error && (
                    <div className="mb-5 p-4 rounded-2xl border border-rose-500/20 bg-rose-500/[0.05]">
                        <Typography variant="small" className="text-rose-600">No se pudieron cargar las categorías.</Typography>
                    </div>
                )}

                <form onSubmit={handleCreate} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="md:col-span-2">
                            <InputField
                                label="Nombre de la categoría"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Ej: Mascotas"
                                maxLength={40}
                            />
                        </div>
                        <InputField
                            label="Tipo"
                            as="select"
                            value={type}
                            onChange={(e) => setType(e.target.value as 'income' | 'expense')}
                        >
                            <option value="expense">Gasto</option>
                            <option value="income">Ingreso</option>
                        </InputField>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 rounded-xl border border-foreground/10 bg-card px-3 py-2.5">
                            <span className="text-muted-foreground">{renderCategoryIcon(icon, 'h-4 w-4')}</span>
                            <Typography variant="small" className="text-muted-foreground">{icon}</Typography>
                        </div>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setShowIcons((prev) => !prev)}>
                            <Shapes size={14} className="mr-2" /> {showIcons ? 'Ocultar iconos' : 'Cambiar ícono'}
                        </Button>
                    </div>

                    {showIcons && (
                        <IconPicker value={icon} onSelect={(selected) => { setIcon(selected); setShowIcons(false) }} />
                    )}

                    {formError && (
                        <Typography variant="muted" className="text-rose-500">{formError}</Typography>
                    )}

                    <Button type="submit" variant="primary" disabled={isBusy} className="w-full md:w-auto">
                        {isBusy ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Plus size={16} className="mr-2" />}
                        Crear categoría
                    </Button>
                </form>
            </Card>

            {/* Listado */}
            <Card variant="elevated">
                <div className="flex items-center space-x-3 mb-6">
                    <div className="p-2 bg-emerald-500/10 rounded-xl">
                        <Shapes size={20} className="text-emerald-600" />
                    </div>
                    <div>
                        <Typography variant="h3">Categorías del Niddo</Typography>
                        <Typography variant="muted">
                            {isLoading ? 'Cargando...' : 'Las del sistema no se pueden modificar; las tuyas sí.'}
                        </Typography>
                    </div>
                </div>

                <div className="space-y-8">
                    {renderGroup('Gastos', categories.filter((c) => c.type === 'expense'))}
                    {renderGroup('Ingresos', categories.filter((c) => c.type === 'income'))}
                </div>
            </Card>

            {/* Confirmación de borrado: muestra el impacto y permite reasignar */}
            {pendingDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setPendingDelete(null)} />

                    <Card variant="glass" className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 sm:p-8 rounded-3xl">
                        <div className="flex items-start gap-4">
                            <div className="h-12 w-12 shrink-0 rounded-2xl bg-rose-500/10 text-rose-600 flex items-center justify-center border border-rose-500/20">
                                <AlertTriangle size={22} />
                            </div>
                            <div className="space-y-2">
                                <Typography variant="h3">¿Eliminar «{pendingDelete.name}»?</Typography>
                                <Typography variant="muted" className="text-foreground/60">
                                    Estos son los registros que usan la categoría. Puedes moverlos a otra
                                    categoría o borrarla y dejarlos sin categoría: el historial nunca se borra.
                                </Typography>
                            </div>
                        </div>

                        {/* Impacto real de la categoría */}
                        <div className="mt-6 space-y-4">
                            {impactQuery.isLoading && (
                                <div className="flex items-center justify-center gap-3 rounded-2xl border border-foreground/10 bg-card py-8">
                                    <Loader2 size={18} className="animate-spin text-muted-foreground" />
                                    <Typography variant="muted" className="text-muted-foreground">
                                        Calculando el impacto de la categoría...
                                    </Typography>
                                </div>
                            )}

                            {impactQuery.isError && (
                                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-4 space-y-1">
                                    <Typography variant="small" className="text-amber-700 dark:text-amber-300">
                                        No se pudo calcular el impacto de la categoría.
                                    </Typography>
                                    <Typography variant="muted" className="text-foreground/60">
                                        {impactQuery.error instanceof Error
                                            ? impactQuery.error.message
                                            : 'Inténtalo de nuevo.'}{' '}
                                        Puedes eliminarla de todos modos: no se pierde nada.
                                    </Typography>
                                </div>
                            )}

                            {counts && (
                                <>
                                    <ImpactSummaryTiles counts={counts} />

                                    {affectedTotal === 0 ? (
                                        <div className="flex items-start gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-3">
                                            <Check size={14} className="mt-0.5 shrink-0 text-emerald-600" />
                                            <Typography variant="muted" className="text-foreground/70">
                                                No hay registros usando esta categoría. Puedes eliminarla sin más.
                                            </Typography>
                                        </div>
                                    ) : (
                                        <AffectedRecordsList affected={affected} counts={counts} />
                                    )}
                                </>
                            )}
                        </div>

                        {/* Reasignar antes de borrar */}
                        {counts && affectedTotal > 0 && (
                            <div className="mt-6 space-y-3 rounded-2xl border border-foreground/10 bg-card p-4">
                                <div className="flex items-start gap-2">
                                    <ArrowRightLeft size={15} className="mt-0.5 shrink-0 text-primary" />
                                    <div className="space-y-1">
                                        <Typography variant="small" className="text-foreground/80">
                                            Mover a otra categoría
                                        </Typography>
                                        <Typography variant="muted" className="text-muted-foreground">
                                            Los {affectedTotal} registros pasan a la categoría que elijas.
                                            Después podrás eliminar «{pendingDelete.name}» sin dejar nada atrás.
                                        </Typography>
                                    </div>
                                </div>

                                {targetCategories.length > 0 ? (
                                    <div className="flex flex-col sm:flex-row gap-2">
                                        <div className="flex-1 min-w-0 relative">
                                            <select
                                                value={targetCategoryId}
                                                onChange={(e) => setTargetCategoryId(e.target.value)}
                                                className={`${selectStyles} w-full py-2.5`}
                                                aria-label="Categoría de destino"
                                            >
                                                <option value="">Elige una categoría...</option>
                                                {targetCategories.map((c) => (
                                                    <option key={c.id} value={c.id}>{c.name}</option>
                                                ))}
                                            </select>
                                            <ChevronDown
                                                size={16}
                                                aria-hidden="true"
                                                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                                            />
                                        </div>
                                        <Button
                                            variant="primary"
                                            onClick={handleReassign}
                                            disabled={isBusy || !targetCategoryId}
                                        >
                                            {reassignCategory.isPending
                                                ? <Loader2 size={16} className="mr-2 animate-spin" />
                                                : <ArrowRightLeft size={16} className="mr-2" />}
                                            Mover registros
                                        </Button>
                                    </div>
                                ) : (
                                    <Typography variant="muted" className="text-muted-foreground">
                                        No hay otra categoría del mismo tipo donde moverlos.
                                    </Typography>
                                )}
                            </div>
                        )}

                        {reassignNotice && (
                            <div className="mt-4 flex items-start gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-3">
                                <Check size={14} className="mt-0.5 shrink-0 text-emerald-600" />
                                <Typography variant="muted" className="text-foreground/70">{reassignNotice}</Typography>
                            </div>
                        )}

                        {(reassignError || deleteError) && (
                            <Typography variant="muted" className="mt-4 text-rose-500">
                                {reassignError || deleteError}
                            </Typography>
                        )}

                        <div className="flex flex-col sm:flex-row gap-3 mt-6">
                            <Button variant="ghost" className="flex-1" onClick={() => setPendingDelete(null)} disabled={isBusy}>
                                Cancelar
                            </Button>
                            <Button variant="danger" className="flex-1" onClick={handleDelete} disabled={isBusy}>
                                {deleteCategory.isPending
                                    ? <Loader2 size={16} className="mr-2 animate-spin" />
                                    : <Trash2 size={16} className="mr-2" />}
                                Eliminar y dejar sin categoría
                            </Button>
                        </div>
                    </Card>
                </div>
            )}

            {/* Resultado del borrado: detalle de lo afectado */}
            {deleteResult && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setDeleteResult(null)} />

                    <Card variant="glass" className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto p-8 rounded-3xl">
                        <div className="flex items-start gap-4">
                            <div className="h-12 w-12 shrink-0 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center border border-emerald-500/20">
                                <Check size={22} />
                            </div>
                            <div className="space-y-2">
                                <Typography variant="h3">Categoría eliminada</Typography>
                                <Typography variant="muted" className="text-foreground/60">
                                    {deleteResult.warnings?.message
                                        || 'La categoría se eliminó. El historial de movimientos se conserva.'}
                                </Typography>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
                            <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-3 text-center">
                                <p className="text-xl font-black text-foreground">
                                    {deleteResult.warnings?.transactions_affected ?? 0}
                                </p>
                                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Movimientos</p>
                            </div>
                            <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-3 text-center">
                                <p className="text-xl font-black text-foreground">
                                    {deleteResult.warnings?.budgets_affected ?? 0}
                                </p>
                                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Presupuestos</p>
                            </div>
                            <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-3 text-center">
                                <p className="text-xl font-black text-foreground">
                                    {deleteResult.warnings?.items_affected ?? 0}
                                </p>
                                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Productos</p>
                            </div>
                            <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-3 text-center">
                                <p className="text-xl font-black text-foreground">
                                    {deleteResult.warnings?.debts_affected ?? 0}
                                </p>
                                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Deudas</p>
                            </div>
                        </div>

                        {deleteResult.warnings?.affected && (
                            <div className="mt-4">
                                <AffectedRecordsList
                                    affected={deleteResult.warnings.affected}
                                    counts={{
                                        transactions: deleteResult.warnings.transactions_affected ?? 0,
                                        budgets: deleteResult.warnings.budgets_affected ?? 0,
                                        items: deleteResult.warnings.items_affected ?? 0,
                                        debts: deleteResult.warnings.debts_affected ?? 0,
                                    }}
                                />
                            </div>
                        )}

                        <Button variant="primary" className="w-full mt-6" onClick={() => setDeleteResult(null)}>
                            Entendido
                        </Button>
                    </Card>
                </div>
            )}
        </div>
    )
}

export default function SettingsForm({ family, members }: { family: FamilyData, members: Member[] }) {
    const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false)
    const [confirmName, setConfirmName] = useState('')
    const [isLeaving, setIsLeaving] = useState(false)
    const [hasCopied, setHasCopied] = useState(false)
    const [activeTab, setActiveTab] = useState<'general' | 'appearance' | 'categories'>('general')
    const { theme, setTheme } = useTheme()
    const { palette, setPalette } = useColorPalette()

    const router = useRouter()

    const handleLeave = async () => {
        if (confirmName !== family.name) return
        setIsLeaving(true)
        try {
            await leaveFamily()
            router.push('/onboarding')
            router.refresh()
        } catch (error) {
            console.error(error)
            alert('Error al salir de la familia')
            setIsLeaving(false)
        }
    }

    return (
        <div className="space-y-8 pb-32">
            {/* Tabs Navigation */}
            <div className="flex p-1 bg-foreground/[0.03] rounded-2xl w-full md:w-fit">
                <button
                    onClick={() => setActiveTab('general')}
                    className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${activeTab === 'general' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    General
                </button>
                <button
                    onClick={() => setActiveTab('appearance')}
                    className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${activeTab === 'appearance' ? 'bg-card text-pink-600 shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    Apariencia
                </button>
                <button
                    onClick={() => setActiveTab('categories')}
                    className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${activeTab === 'categories' ? 'bg-card text-blue-600 shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    Categorías
                </button>
            </div>

            {activeTab === 'general' ? (
                <div className="space-y-8 animate-in fade-in slide-in-from-left-4 duration-300">
                    {/* Family Info */}
                    <Card variant="elevated" className="overflow-hidden">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <Typography variant="h3">Información del Niddo</Typography>
                                <Typography variant="muted">Detalles de tu hogar y acceso familiar.</Typography>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="bg-foreground/[0.01] p-5 rounded-2xl border border-foreground/[0.03] flex justify-between items-center transition-colors hover:bg-foreground/[0.02]">
                                <div>
                                    <Typography variant="small" className="opacity-40 font-black uppercase tracking-widest text-[10px] mb-1">Nombre del Niddo</Typography>
                                    <Typography variant="h3" className="text-foreground/90">{family.name}</Typography>
                                </div>
                                <div className="p-3 bg-card rounded-2xl shadow-sm border border-foreground/[0.05]">
                                    <Home size={24} className="text-primary" />
                                </div>
                            </div>

                            <div className="bg-primary/5 p-5 rounded-2xl border border-primary/10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                                <div className="flex items-center space-x-4">
                                    <div className="p-3 bg-primary/10 rounded-2xl">
                                        <LinkIcon size={20} className="text-primary" />
                                    </div>
                                    <div>
                                        <Typography variant="small" className="text-primary/60 font-black uppercase tracking-widest text-[10px]">Código de Invitación</Typography>
                                        <Typography variant="body" className="font-mono text-xl font-black text-primary mt-0.5 tracking-wider">
                                            {family.invite_code || '---'}
                                        </Typography>
                                    </div>
                                </div>
                                {family.invite_code && (
                                    <Button
                                        size="sm"
                                        variant={hasCopied ? 'success' : 'primary'}
                                        onClick={() => {
                                            const url = `${window.location.origin}/invite/${family.invite_code}`
                                            navigator.clipboard.writeText(url)
                                            setHasCopied(true)
                                            setTimeout(() => setHasCopied(false), 2000)
                                        }}
                                        className="md:w-auto w-full shadow-lg shadow-primary/10"
                                    >
                                        {hasCopied ? (
                                            <><Check size={16} className="mr-2" /> ¡Copiado!</>
                                        ) : (
                                            <><Copy size={16} className="mr-2" /> Copiar Invitación</>
                                        )}
                                    </Button>
                                )}
                            </div>
                        </div>
                    </Card>

                    {/* Members List */}
                    <Card variant="elevated">
                        <div className="flex justify-between items-center mb-8">
                            <div className="flex items-center space-x-3">
                                <div className="p-2 bg-indigo-500/10 rounded-xl">
                                    <Users size={20} className="text-indigo-600" />
                                </div>
                                <div>
                                    <Typography variant="h3">Integrantes</Typography>
                                    <Typography variant="muted">{members.length} personas forman parte de este Niddo.</Typography>
                                </div>
                            </div>
                        </div>

                        <ul className="space-y-4">
                            {members.map((member) => (
                                <li key={member.id} className="group">
                                    <div className="flex items-center p-4 rounded-2xl hover:bg-foreground/[0.02] transition-all border border-transparent border-foreground/[0.03] group-hover:border-foreground/[0.08]">
                                        <div className="flex-shrink-0">
                                            <div className="h-14 w-14 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-600 flex items-center justify-center text-white font-black text-xl shadow-md group-hover:scale-105 transition-transform duration-300">
                                                {(member.full_name || member.email || '?')[0].toUpperCase()}
                                            </div>
                                        </div>
                                        <div className="ml-5 flex-1">
                                            <Typography variant="body" className="font-black text-foreground/80">
                                                {member.full_name || 'Sin nombre configurado'}
                                            </Typography>
                                            <Typography variant="muted" className="text-xs mt-0.5 font-medium opacity-60">
                                                {member.email}
                                            </Typography>
                                        </div>
                                        <div className="px-3 py-1 bg-foreground/[0.05] text-foreground/40 rounded-xl text-[10px] font-black tracking-widest uppercase opacity-0 group-hover:opacity-100 transition-opacity">
                                            Miembro
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </Card>

                    {/* Danger Zone */}
                    <Card variant="elevated" className="border-rose-500/10 bg-rose-500/[0.01]">
                        <div className="flex items-center space-x-3 mb-4">
                            <div className="p-2 bg-rose-500/10 rounded-xl">
                                <AlertTriangle size={20} className="text-rose-500" />
                            </div>
                            <Typography variant="h3" className="text-rose-600">Zona Peligrosa</Typography>
                        </div>
                        <Typography variant="body" className="text-rose-900/40 mb-8 text-sm leading-relaxed max-w-2xl">
                            Al abandonar este Niddo, perderás acceso instantáneo a todas las finanzas compartidas. Esta acción requiere confirmación manual para evitar accidentes.
                        </Typography>
                        <Button
                            variant="outline"
                            onClick={() => setIsLeaveModalOpen(true)}
                            className="border-rose-500/20 text-rose-600 hover:bg-rose-500 hover:text-white transition-all w-full md:w-auto"
                        >
                            <LogOut size={16} className="mr-2" />
                            Abandonar Niddo
                        </Button>
                    </Card>
                </div>
            ) : activeTab === 'appearance' ? (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                    <Card variant="elevated">
                        <div className="flex justify-between items-center mb-6">
                            <div className="flex items-center space-x-3">
                                <div className="p-2 bg-pink-500/10 rounded-xl">
                                    <Palette size={20} className="text-pink-600" />
                                </div>
                                <div>
                                    <Typography variant="h3">Apariencia</Typography>
                                    <Typography variant="muted">Personaliza la experiencia visual de Niddo.</Typography>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-8">

                            {/* Section 1: System Mode (Light/Dark) */}
                            <div>
                                <div className="mb-4">
                                    <Typography variant="body" className="font-bold text-base mb-1">Modo del Sistema</Typography>
                                    <Typography variant="muted" className="text-sm">Elige si prefieres una interfaz clara u oscura.</Typography>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <button
                                        onClick={() => setTheme('light')}
                                        className={`group relative flex flex-col items-center p-6 rounded-3xl border transition-all duration-300 ${theme === 'light' ? 'bg-card border-primary shadow-xl shadow-primary/10 scale-[1.02]' : 'bg-card/50 border-transparent hover:bg-card hover:border-foreground/10'}`}
                                    >
                                        <Sun size={32} className={`mb-4 ${theme === 'light' ? 'text-primary' : 'text-muted-foreground'}`} />
                                        <span className={`font-bold ${theme === 'light' ? 'text-primary' : 'text-muted-foreground'}`}>Claro</span>
                                    </button>

                                    <button
                                        onClick={() => setTheme('dark')}
                                        className={`group relative flex flex-col items-center p-6 rounded-3xl border transition-all duration-300 ${theme === 'dark' ? 'bg-card border-primary shadow-xl shadow-primary/10 scale-[1.02]' : 'bg-card/50 border-transparent hover:bg-card hover:border-foreground/10'}`}
                                    >
                                        <Moon size={32} className={`mb-4 ${theme === 'dark' ? 'text-primary' : 'text-muted-foreground'}`} />
                                        <span className={`font-bold ${theme === 'dark' ? 'text-primary' : 'text-muted-foreground'}`}>Oscuro</span>
                                    </button>

                                    <button
                                        onClick={() => setTheme('system')}
                                        className={`group relative flex flex-col items-center p-6 rounded-3xl border transition-all duration-300 ${theme === 'system' ? 'bg-card border-primary shadow-xl shadow-primary/10 scale-[1.02]' : 'bg-card/50 border-transparent hover:bg-card hover:border-foreground/10'}`}
                                    >
                                        <Monitor size={32} className={`mb-4 ${theme === 'system' ? 'text-primary' : 'text-muted-foreground'}`} />
                                        <span className={`font-bold ${theme === 'system' ? 'text-primary' : 'text-muted-foreground'}`}>Automático</span>
                                    </button>
                                </div>
                            </div>

                            {/* Section 2: Color Palette */}
                            <div>
                                <div className="mb-4">
                                    <Typography variant="body" className="font-bold text-base mb-1">Paleta de Colores</Typography>
                                    <Typography variant="muted" className="text-sm">Personaliza el acento de color de la aplicación.</Typography>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

                                    {/* Default Palette */}
                                    <button
                                        onClick={() => setPalette('default')}
                                        className={`group relative flex flex-col items-center p-6 rounded-3xl border transition-all duration-300 ${palette === 'default' ? 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-500 shadow-xl shadow-indigo-500/10 scale-[1.02]' : 'bg-card/50 border-transparent hover:bg-card hover:border-foreground/10'}`}
                                    >
                                        <div className="w-12 h-12 rounded-full bg-indigo-600 mb-3 shadow-lg flex items-center justify-center">
                                            <Palette size={20} className="text-white" />
                                        </div>
                                        <span className={`font-bold ${palette === 'default' ? 'text-indigo-700 dark:text-indigo-300' : 'text-muted-foreground'}`}>Original</span>
                                    </button>

                                    {/* Sunset Palette */}
                                    <button
                                        onClick={() => setPalette('sunset')}
                                        className={`group relative flex flex-col items-center p-6 rounded-3xl border transition-all duration-300 ${palette === 'sunset' ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-500 shadow-xl shadow-rose-500/10 scale-[1.02]' : 'bg-card/50 border-transparent hover:bg-card hover:border-foreground/10'}`}
                                    >
                                        <div className="w-12 h-12 rounded-full bg-rose-600 mb-3 shadow-lg flex items-center justify-center">
                                            <Sunset size={20} className="text-white" />
                                        </div>
                                        <span className={`font-bold ${palette === 'sunset' ? 'text-rose-700 dark:text-rose-300' : 'text-muted-foreground'}`}>Sunset</span>
                                    </button>

                                    {/* Forest Palette */}
                                    <button
                                        onClick={() => setPalette('forest')}
                                        className={`group relative flex flex-col items-center p-6 rounded-3xl border transition-all duration-300 ${palette === 'forest' ? 'bg-green-50 dark:bg-green-950/30 border-green-600 shadow-xl shadow-green-600/10 scale-[1.02]' : 'bg-card/50 border-transparent hover:bg-card hover:border-foreground/10'}`}
                                    >
                                        <div className="w-12 h-12 rounded-full bg-green-600 mb-3 shadow-lg flex items-center justify-center">
                                            <Leaf size={20} className="text-white" />
                                        </div>
                                        <span className={`font-bold ${palette === 'forest' ? 'text-green-700 dark:text-green-300' : 'text-muted-foreground'}`}>Forest</span>
                                    </button>

                                    {/* Ocean Palette */}
                                    <button
                                        onClick={() => setPalette('ocean')}
                                        className={`group relative flex flex-col items-center p-6 rounded-3xl border transition-all duration-300 ${palette === 'ocean' ? 'bg-sky-50 dark:bg-sky-950/30 border-sky-600 shadow-xl shadow-sky-600/10 scale-[1.02]' : 'bg-card/50 border-transparent hover:bg-card hover:border-foreground/10'}`}
                                    >
                                        <div className="w-12 h-12 rounded-full bg-sky-600 mb-3 shadow-lg flex items-center justify-center">
                                            <Droplets size={20} className="text-white" />
                                        </div>
                                        <span className={`font-bold ${palette === 'ocean' ? 'text-sky-700 dark:text-sky-300' : 'text-muted-foreground'}`}>Ocean</span>
                                    </button>

                                </div>
                            </div>
                        </div>
                    </Card>
                </div>
            ) : (
                <CategoriesPanel />
            )}


            {/* Leave Modal */}
            {isLeaveModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-500">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setIsLeaveModalOpen(false)}></div>

                    <Card variant="glass" className="relative w-full max-w-md shadow-2xl border-white/5 dark:border-white/10 p-10 transform animate-in zoom-in-95 duration-300 rounded-[32px]">
                        <div className="flex flex-col items-center text-center space-y-6 mb-10">
                            <div className="h-20 w-20 bg-rose-500/10 text-rose-600 rounded-[28px] flex items-center justify-center shadow-inner border border-rose-500/20">
                                <AlertTriangle size={40} />
                            </div>
                            <div className="space-y-2">
                                <Typography variant="h2" className="text-foreground tracking-tight">¿Estás seguro?</Typography>
                                <Typography variant="body" className="text-foreground/40 text-sm">
                                    Confirma que deseas salir de <b>{family.name}</b> escribiendo el nombre abajo.
                                </Typography>
                            </div>
                        </div>

                        <div className="space-y-8">
                            <div className="p-4 bg-foreground/[0.03] rounded-2xl border border-foreground/[0.05] text-center font-black tracking-widest text-foreground/20 select-none text-sm uppercase">
                                {family.name}
                            </div>

                            <InputField
                                label="Validación de Seguridad"
                                placeholder={`Escribe exactamente "${family.name}"`}
                                value={confirmName}
                                onChange={(e) => setConfirmName(e.target.value)}
                                onPaste={(e) => {
                                    e.preventDefault()
                                    alert('¡Escríbelo manualmente! Es por tu seguridad 🛡️')
                                }}
                                autoComplete="off"
                                className="text-center"
                            />

                            <div className="flex flex-col gap-4 pt-4">
                                <Button
                                    variant="danger"
                                    onClick={handleLeave}
                                    disabled={confirmName !== family.name || isLeaving}
                                    className="w-full py-5 text-lg font-black tracking-wide rounded-2xl shadow-xl shadow-rose-500/20"
                                >
                                    {isLeaving ? 'Saliendo...' : 'Confirmar y Abandonar'}
                                </Button>
                                <Button
                                    variant="ghost"
                                    onClick={() => {
                                        setIsLeaveModalOpen(false)
                                        setConfirmName('')
                                    }}
                                    className="w-full text-foreground/40 hover:text-foreground font-bold"
                                >
                                    No, cancelar
                                </Button>
                            </div>
                        </div>
                    </Card>
                </div>
            )}
        </div >
    )
}
