import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { PageHeader } from '@/components/ui/molecules/PageHeader';
import { Card } from '@/components/ui/molecules/Card';
import { Typography } from '@/components/ui/atoms/Typography';
import { Button } from '@/components/ui/atoms/Button';
import { formatCurrency } from '@/utils/format';
import { Plus, CreditCard, Wallet, Banknote, Edit2, ExternalLink } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'

async function getAccounts(token: string) {
    const res = await fetch(`${API_URL}/accounts/`, {
        headers: {
            'Authorization': `Bearer ${token}`
        },
        cache: 'no-store'
    })
    if (!res.ok) return []
    return res.json()
}

export default async function AccountsPage() {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) redirect('/login')

    const accounts = await getAccounts(session.access_token)

    return (
        <main className="max-w-5xl mx-auto p-4 md:p-8 space-y-8 min-h-screen pb-24">
            <PageHeader
                title="Mis Cuentas"
                description="Gestión centralizada de tus activos y billeteras."
                backHref="/"
                actions={
                    <Link href="/accounts/new">
                        <Button size="sm">
                            <Plus size={16} className="mr-2" />
                            Nueva Cuenta
                        </Button>
                    </Link>
                }
            />

            <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {accounts.map((account: any) => (
                    <Card
                        key={account.id}
                        variant="elevated"
                        className={`group hover:scale-[1.01] transition-all duration-300 border-l-4 ${account.type === 'personal' ? 'border-l-indigo-500 border-indigo-500/10' : 'border-l-emerald-500 border-emerald-500/10'}`}
                    >
                        <div className="flex justify-between items-start mb-6">
                            <div className={`p-3 rounded-2xl shadow-sm border ${account.type === 'personal'
                                ? 'bg-indigo-500/10 text-indigo-600 border-indigo-500/10'
                                : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/10'
                                }`}>
                                {account.type === 'personal' ? <Wallet size={24} /> : <CreditCard size={24} />}
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${account.type === 'personal'
                                ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                }`}>
                                {account.type === 'personal' ? 'Personal' : 'Familiar'}
                            </span>
                        </div>

                        <div className="space-y-1">
                            <Typography variant="body" className="font-bold opacity-40 uppercase tracking-tighter text-[9px]">{account.type === 'personal' ? 'Billetera' : 'Cuenta de Ahorros'}</Typography>
                            <Typography variant="h3" className="truncate text-foreground font-black tracking-tight">{account.name}</Typography>
                        </div>

                        <Typography variant="h1" className="mt-4 text-foreground tracking-tighter font-black">
                            {formatCurrency(account.balance)}
                        </Typography>

                        <div className="mt-8 flex justify-end space-x-2 pt-4 border-t border-foreground/[0.03]">
                            <Button variant="ghost" size="sm" className="text-foreground/50 hover:text-blue-600 transition-colors">
                                <ExternalLink size={14} className="mr-2" />
                                Detalles
                            </Button>
                            <Button variant="ghost" size="sm" className="text-foreground/50 hover:text-indigo-600 transition-colors">
                                <Edit2 size={14} className="mr-2" />
                                Editar
                            </Button>
                        </div>
                    </Card>
                ))}

                {accounts.length === 0 && (
                    <Card variant="outline" padding="lg" className="col-span-full text-center py-24 border-dashed border-foreground/10 bg-foreground/[0.01]">
                        <div className="mx-auto h-20 w-20 text-foreground/10 mb-6 bg-foreground/[0.02] rounded-full flex items-center justify-center">
                            <Banknote size={40} />
                        </div>
                        <Typography variant="h3" className="mb-2">Organiza tus finanzas</Typography>
                        <Typography variant="body" className="text-foreground/40 mb-10 max-w-sm mx-auto">
                            Registra tus cuentas bancarias o efectivo para empezar a rastrear tus movimientos hoy mismo.
                        </Typography>
                        <Link href="/accounts/new">
                            <Button size="lg" className="shadow-blue-500/20 shadow-xl">
                                <Plus size={18} className="mr-2" />
                                Crear Primera Cuenta
                            </Button>
                        </Link>
                    </Card>
                )}
            </div>
        </main>
    )
}
