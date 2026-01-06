import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createAccount } from '../actions'

export default async function NewAccountPage() {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) redirect('/login')

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-md mx-auto bg-white rounded-xl shadow-md overflow-hidden p-6">
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-gray-900">Nueva Cuenta</h1>
                    <p className="text-sm text-gray-500">
                        Crea una cuenta para registrar tus movimientos (Ej. Efectivo, Banco, Ahorros).
                    </p>
                </div>

                <form action={createAccount} className="space-y-6">
                    {/* Name */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Nombre de la Cuenta</label>
                        <input
                            type="text"
                            name="name"
                            required
                            placeholder="Ej. Billetera Principal"
                            className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md text-gray-900"
                        />
                    </div>

                    {/* Type */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Tipo (Propiedad)</label>
                        <select name="type" className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
                            <option value="personal">Personal (Sólo yo)</option>
                            <option value="joint">Familiar (Visible para todos)</option>
                        </select>
                    </div>

                    {/* Initial Balance */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Saldo Inicial</label>
                        <div className="mt-1 relative rounded-md shadow-sm">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <span className="text-gray-500 sm:text-sm">$</span>
                            </div>
                            <input
                                type="number"
                                name="balance"
                                step="0.01"
                                defaultValue="0.00"
                                className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-7 pr-12 sm:text-sm border-gray-300 rounded-md text-gray-900"
                                placeholder="0.00"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end space-x-3 pt-4">
                        <Link href="/transactions/new" className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                            Cancelar
                        </Link>
                        <button type="submit" className="bg-blue-600 border border-transparent rounded-md shadow-sm py-2 px-4 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                            Crear Cuenta
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
