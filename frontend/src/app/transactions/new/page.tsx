import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createTransaction } from '../actions'
import { PageHeader } from '@/components/ui/molecules/PageHeader';
import { Card } from '@/components/ui/molecules/Card';
import { Typography } from '@/components/ui/atoms/Typography';
import { Button } from '@/components/ui/atoms/Button';
import { InputField } from '@/components/ui/molecules/InputField';
import { formatCurrency } from '@/utils/format';
import { Save, X, Plus } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'

async function getData(token: string) {
    const [categoriesRes, accountsRes] = await Promise.all([
        fetch(`${API_URL}/categories/`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${API_URL}/accounts/`, { headers: { 'Authorization': `Bearer ${token}` } })
    ])

    const categories = categoriesRes.ok ? await categoriesRes.json() : []
    const accounts = accountsRes.ok ? await accountsRes.json() : []

    return { categories, accounts }
}

export default async function NewTransactionPage() {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) redirect('/login')

    const { categories, accounts } = await getData(session.access_token)

    const incomeCategories = categories.filter((c: any) => c.type === 'income')
    const expenseCategories = categories.filter((c: any) => c.type === 'expense')

    return (
        <main className="max-w-3xl mx-auto p-4 md:p-8 space-y-8 pb-32">
            <PageHeader
                title="Nueva Transacción"
                description="Registra un nuevo movimiento en tus cuentas de forma rápida."
                backHref="/transactions"
            />

            <Card variant="elevated" className="mt-8 border-indigo-500/5 overflow-hidden">
                <form action={createTransaction} className="space-y-10 p-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8">
                        {/* Amount */}
                        <div className="md:col-span-1">
                            <InputField
                                label="Monto total"
                                name="amount"
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                required
                                className="text-2xl font-black tracking-tighter"
                            />
                        </div>

                        {/* Type */}
                        <div className="md:col-span-1">
                            <InputField
                                label="Naturaleza del Flujo"
                                name="type"
                                as="select"
                            >
                                <option value="expense">Gasto (Egreso)</option>
                                <option value="income">Ingreso (Entrada)</option>
                            </InputField>
                        </div>

                        {/* Description */}
                        <div className="md:col-span-2">
                            <InputField
                                label="Concepto o Descripción"
                                name="description"
                                placeholder="Ej: Compra semanal, Bono mensual..."
                                required
                            />
                        </div>

                        {/* Account */}
                        <div className="md:col-span-1">
                            {accounts.length > 0 ? (
                                <InputField
                                    label="Cuenta de Origen"
                                    name="accountId"
                                    as="select"
                                >
                                    {accounts.map((a: any) => (
                                        <option key={a.id} value={a.id}>{a.name} ({formatCurrency(a.balance)})</option>
                                    ))}
                                </InputField>
                            ) : (
                                <div className="p-4 bg-rose-50 dark:bg-rose-500/10 text-rose-600 text-sm rounded-2xl border border-rose-100 dark:border-rose-500/20">
                                    <Typography variant="small" className="font-black uppercase tracking-widest text-[10px] mb-2 block">Acción Crítica:</Typography>
                                    No tienes cuentas configuradas para registrar esta transacción.
                                    <div className="mt-4">
                                        <Link href="/accounts/new">
                                            <Button variant="outline" size="sm" className="bg-white dark:bg-slate-900 border-rose-500/20 text-rose-600 hover:bg-rose-600 hover:text-white transition-all">
                                                <Plus size={14} className="mr-2" />
                                                Crear Cuenta Ahora
                                            </Button>
                                        </Link>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Category */}
                        <div className="md:col-span-1">
                            <InputField
                                label="Categoría"
                                name="categoryId"
                                as="select"
                            >
                                <optgroup label="Gastos Comunes">
                                    {expenseCategories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </optgroup>
                                <optgroup label="Fuentes de Ingreso">
                                    {incomeCategories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </optgroup>
                            </InputField>
                        </div>

                        {/* Date */}
                        <div className="md:col-span-2">
                            <InputField
                                label="Fecha de Registro"
                                name="date"
                                type="date"
                                required
                                defaultValue={new Date().toISOString().split('T')[0]}
                            />
                        </div>
                    </div>

                    <div className="flex flex-col md:flex-row justify-end gap-3 pt-8 border-t border-foreground/[0.03]">
                        <Link href="/transactions" className="order-2 md:order-1">
                            <Button variant="ghost" type="button" className="w-full md:w-auto text-foreground/40 hover:text-foreground">
                                <X size={18} className="mr-2" />
                                Cancelar
                            </Button>
                        </Link>
                        <Button type="submit" className="order-1 md:order-2 w-full md:w-auto px-10 shadow-xl shadow-blue-500/10">
                            <Save size={18} className="mr-2" />
                            Guardar Transacción
                        </Button>
                    </div>
                </form>
            </Card>
        </main>
    )
}
