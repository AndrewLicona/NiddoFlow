import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createTransaction } from '../actions'

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

    // Separate categories by type for easier selection if possible, or just standard list
    const incomeCategories = categories.filter((c: any) => c.type === 'income')
    const expenseCategories = categories.filter((c: any) => c.type === 'expense')

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-md mx-auto bg-white rounded-xl shadow-md overflow-hidden p-6">
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-gray-900">Nueva Transacción</h1>
                </div>

                <form action={createTransaction} className="space-y-6">
                    {/* Amount */}
                    <div>
                        <label className="block text-sm font-bold text-gray-900">Monto</label>
                        <div className="mt-1 relative rounded-md shadow-sm">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <span className="text-gray-500 sm:text-sm">$</span>
                            </div>
                            <input
                                type="number"
                                name="amount"
                                step="0.01"
                                required
                                className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-7 pr-12 sm:text-sm border-gray-300 rounded-md text-gray-900"
                                placeholder="0.00"
                            />
                        </div>
                    </div>

                    {/* Type */}
                    <div>
                        <label className="block text-sm font-bold text-gray-900">Tipo</label>
                        <select name="type" className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
                            <option value="expense">Gasto</option>
                            <option value="income">Ingreso</option>
                            {/* Transfer logic is more complex, postponing */}
                        </select>
                    </div>


                    {/* Description */}
                    <div>
                        <label className="block text-sm font-bold text-gray-900">Descripción</label>
                        <input type="text" name="description" required className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md text-gray-900" />
                    </div>

                    {/* Account */}
                    <div>
                        <label className="block text-sm font-bold text-gray-900">Cuenta</label>
                        {accounts.length > 0 ? (
                            <select name="accountId" className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
                                {accounts.map((a: any) => (
                                    <option key={a.id} value={a.id}>{a.name} (${a.balance})</option>
                                ))}
                            </select>
                        ) : (
                            <div className="mt-1 p-2 bg-yellow-50 text-yellow-700 text-sm rounded border border-yellow-200">
                                Primero debes crear una cuenta (Efectivo, Banco, etc).
                                <br />
                                <Link href="/accounts/new" className="font-bold underline">Crear Cuenta</Link>
                            </div>
                        )}
                    </div>

                    {/* Category */}
                    <div>
                        <label className="block text-sm font-bold text-gray-900">Categoría</label>
                        <select name="categoryId" className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
                            <optgroup label="Gastos">
                                {expenseCategories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </optgroup>
                            <optgroup label="Ingresos">
                                {incomeCategories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </optgroup>
                        </select>
                    </div>

                    {/* Date */}
                    <div>
                        <label className="block text-sm font-bold text-gray-900">Fecha</label>
                        <input type="date" name="date" required defaultValue={new Date().toISOString().split('T')[0]} className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md text-gray-900" />
                    </div>

                    <div className="flex justify-end space-x-3 pt-4">
                        <Link href="/transactions" className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                            Cancelar
                        </Link>
                        <button type="submit" className="bg-blue-600 border border-transparent rounded-md shadow-sm py-2 px-4 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                            Guardar
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
