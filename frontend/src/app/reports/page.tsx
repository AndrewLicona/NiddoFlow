import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/molecules/PageHeader';
import { Card } from '@/components/ui/molecules/Card';
import { Typography } from '@/components/ui/atoms/Typography';
import { formatCurrency } from '@/utils/format';
import { FileText } from 'lucide-react';
import ReportsClient from '@/app/reports/ReportsClient';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

interface Transaction {
    id: string;
    amount: number;
    type: 'income' | 'expense' | 'transfer';
    date: string;
    category_id?: string | null;
}

async function getData(token: string) {
    const res = await fetch(`${API_URL}/transactions/`, { headers: { 'Authorization': `Bearer ${token}` }, cache: 'no-store' });
    return res.ok ? await res.json() : [];
}

export default async function ReportsPage() {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) redirect('/login');

    const transactions = await getData(session.access_token);
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    const currentMonthTransactions = transactions.filter((t: Transaction) => {
        const d = new Date(t.date);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    const income = currentMonthTransactions.filter((t: Transaction) => t.type === 'income').reduce((acc: number, curr: Transaction) => acc + curr.amount, 0);
    const expense = currentMonthTransactions.filter((t: Transaction) => t.type === 'expense').reduce((acc: number, curr: Transaction) => acc + curr.amount, 0);
    const balance = income - expense;

    return (
        <main className="max-w-4xl mx-auto p-4 md:p-8 space-y-8 pb-32">
            <div className="no-print">
                <PageHeader
                    title="Reportes y Exportación"
                    description="Resumen de tu actividad financiera y herramientas de exportación."
                    backHref="/"
                />
            </div>

            {/* Monthly Summary Card */}
            <div className="no-print">
                <Card variant="elevated" className="overflow-hidden bg-gradient-to-br from-blue-600 to-indigo-700 text-white border-none shadow-xl shadow-blue-500/20">
                    <div className="relative z-10">
                        <div className="flex items-center space-x-3 mb-6 opacity-80">
                            <FileText size={20} />
                            <Typography variant="small" className="font-black uppercase tracking-widest text-xs">Resumen Mensual</Typography>
                        </div>

                        <div className="grid grid-cols-2 gap-8 mb-8">
                            <div>
                                <Typography variant="small" className="opacity-60 font-medium mb-1">Ingresos</Typography>
                                <Typography variant="h2" className="text-emerald-300 font-bold tracking-tight">+{formatCurrency(income)}</Typography>
                            </div>
                            <div>
                                <Typography variant="small" className="opacity-60 font-medium mb-1">Gastos</Typography>
                                <Typography variant="h2" className="text-rose-300 font-bold tracking-tight">-{formatCurrency(expense)}</Typography>
                            </div>
                        </div>

                        <div className="pt-6 border-t border-white/10 flex justify-between items-end">
                            <div>
                                <Typography variant="small" className="opacity-60 font-medium mb-1">Balance Neto</Typography>
                                <Typography variant="h1" className="text-white font-black tracking-tighter text-4xl">{formatCurrency(balance)}</Typography>
                            </div>
                            <Typography variant="small" className="opacity-40 font-bold text-[10px] uppercase tracking-widest border border-white/20 px-3 py-1 rounded-full">
                                {today.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })}
                            </Typography>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Client Actions (Export/Share) */}
            <ReportsClient transactions={transactions} />
        </main>
    );
}
