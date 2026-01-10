import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createAccount } from '../actions'
import { PageHeader } from '@/components/ui/molecules/PageHeader';
import { Card } from '@/components/ui/molecules/Card';
import { Button } from '@/components/ui/atoms/Button';
import { InputField } from '@/components/ui/molecules/InputField';

export default async function NewAccountPage() {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) redirect('/login')

    return (
        <main className="max-w-2xl mx-auto p-4 md:p-8">
            <PageHeader
                title="Nueva Cuenta"
                description="Crea una cuenta para registrar tus movimientos (Ej. Efectivo, Banco, Ahorros)."
                backHref="/accounts"
            />

            <Card variant="glass" className="mt-8">
                <form action={createAccount} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Name */}
                        <div className="md:col-span-2">
                            <InputField
                                label="Nombre de la Cuenta"
                                name="name"
                                required
                                placeholder="Ej. Billetera Principal, Ahorros Bancolombia..."
                            />
                        </div>

                        {/* Type */}
                        <div className="md:col-span-1">
                            <InputField
                                label="Tipo de Propiedad"
                                name="type"
                                as="select"
                            >
                                <option value="personal">Personal (Sólo yo)</option>
                                <option value="joint">Familiar (Visible para todos)</option>
                            </InputField>
                        </div>

                        {/* Initial Balance */}
                        <div className="md:col-span-1">
                            <InputField
                                label="Saldo Inicial"
                                name="balance"
                                type="number"
                                step="0.01"
                                defaultValue="0.00"
                                placeholder="0.00"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end space-x-3 pt-6 border-t border-gray-100">
                        <Link href="/accounts">
                            <Button variant="ghost" type="button">
                                Cancelar
                            </Button>
                        </Link>
                        <Button type="submit">
                            Crear Cuenta
                        </Button>
                    </div>
                </form>
            </Card>
        </main>
    )
}
