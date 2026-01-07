// src/app/transactions/TransactionList.tsx
'use client';

import React, { useState } from 'react';
import { formatCurrency } from '@/utils/format';
import { Typography } from '@/components/ui/atoms/Typography';
import { Card } from '@/components/ui/molecules/Card';
import { Button } from '@/components/ui/atoms/Button';
import { InputField } from '@/components/ui/molecules/InputField';
import {
    ArrowUpLeft,
    ArrowDownRight,
    ArrowLeftRight,
    ChevronDown,
    Trash2,
    Edit2,
    Save,
    X,
    CheckCircle2,
    History as LucideHistory
} from 'lucide-react';
import { deleteTransaction, updateTransaction } from './actions';

interface Transaction {
    id: string;
    description: string;
    amount: number;
    type: 'income' | 'expense' | 'transfer';
    date: string;
    category_id?: string;
    account_id?: string;
    category_name?: string;
    account_name?: string;
    user_name?: string;
}

interface Category {
    id: string;
    name: string;
    type: 'income' | 'expense';
}

interface Account {
    id: string;
    name: string;
    balance: number;
}

interface Props {
    transactions: Transaction[];
    categories: Category[];
    accounts: Account[];
}

const TransactionList: React.FC<Props> = ({ transactions, categories, accounts }) => {
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editData, setEditData] = useState<Partial<Transaction>>({});
    const [isUpdating, setIsUpdating] = useState(false);
    const [filter, setFilter] = useState<'all' | 'income' | 'expense' | 'debts'>('all');
    const [debtSubFilter, setDebtSubFilter] = useState<'all' | 'income' | 'expense'>('all');

    const toggleExpand = (id: string, e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('button')) return;
        if (editingId === id) return;
        setExpandedId(expandedId === id ? null : id);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('¿Estás seguro de que deseas eliminar esta transacción? Esta acción no se puede deshacer.')) {
            return;
        }

        setIsDeleting(id);
        try {
            await deleteTransaction(id);
        } catch (error) {
            console.error(error);
            alert('Error al eliminar la transacción');
        } finally {
            setIsDeleting(null);
        }
    };

    const startEditing = (t: Transaction) => {
        setEditingId(t.id);
        setEditData({
            description: t.description,
            amount: t.amount,
            type: t.type,
            category_id: t.category_id,
            account_id: t.account_id,
            date: t.date.split('T')[0]
        });
    };

    const handleUpdate = async () => {
        if (!editingId) return;
        setIsUpdating(true);
        try {
            await updateTransaction(editingId, editData);
            setEditingId(null);
            setExpandedId(null);
        } catch (error) {
            console.error(error);
            alert('Error al actualizar la transacción');
        } finally {
            setIsUpdating(false);
        }
    };

    const processedTransactions = React.useMemo(() => {
        let filtered = [...transactions];

        if (filter === 'income') {
            filtered = filtered.filter(t =>
                t.type === 'income' &&
                !t.description.includes('[PRESTAMO RECIBIDO]') &&
                !t.description.includes('[COBRO DEUDA]')
            );
        } else if (filter === 'expense') {
            filtered = filtered.filter(t =>
                t.type === 'expense' &&
                !t.description.includes('[PAGO DEUDA]') &&
                !t.description.toLowerCase().startsWith('pago de deuda') &&
                !t.description.includes('[PRESTAMO OTORGADO]')
            );
        } else if (filter === 'debts') {
            filtered = filtered.filter(t => {
                const desc = t.description.toUpperCase();
                const isDebtMatch =
                    desc.includes('[PRESTAMO RECIBIDO]') ||
                    desc.includes('[COBRO DEUDA]') ||
                    desc.includes('[PAGO DEUDA]') ||
                    desc.includes('PAGO DE DEUDA') ||
                    desc.includes('[PRESTAMO OTORGADO]');

                if (!isDebtMatch) return false;

                if (debtSubFilter === 'income') return t.type === 'income';
                if (debtSubFilter === 'expense') return t.type === 'expense';
                return true;
            });
        }

        // Group by Date
        const groups: { [key: string]: Transaction[] } = {};
        filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).forEach(t => {
            const dateStr = new Date(t.date).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
            if (!groups[dateStr]) groups[dateStr] = [];
            groups[dateStr].push(t);
        });

        return groups;
    }, [transactions, filter, debtSubFilter]);

    return (
        <div className="space-y-8">
            {/* Segmentation Tabs */}
            <div className="flex flex-col space-y-4">
                <div className="flex p-1 bg-foreground/[0.03] rounded-2xl border border-foreground/[0.05] w-fit mx-auto md:mx-0 overflow-x-auto max-w-full no-scrollbar">
                    {(['all', 'income', 'expense', 'debts'] as const).map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-5 py-2.5 rounded-xl text-[10px] whitespace-nowrap font-black uppercase tracking-widest transition-all duration-300 ${filter === f
                                ? 'bg-white text-blue-600 shadow-sm border border-blue-100'
                                : 'text-foreground/30 hover:text-foreground/60'
                                }`}
                        >
                            {f === 'all' ? 'Todos' :
                                f === 'income' ? 'Ingresos' :
                                    f === 'expense' ? 'Gastos' : 'Préstamos'}
                        </button>
                    ))}
                </div>

                {filter === 'debts' && (
                    <div className="flex p-1 bg-foreground/[0.02] rounded-xl border border-foreground/[0.03] w-fit mx-auto md:mx-0 animate-in fade-in slide-in-from-left-2 duration-300">
                        {(['all', 'income', 'expense'] as const).map((sf) => (
                            <button
                                key={sf}
                                onClick={() => setDebtSubFilter(sf)}
                                className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${debtSubFilter === sf
                                    ? sf === 'income' ? 'bg-emerald-500/10 text-emerald-600' :
                                        sf === 'expense' ? 'bg-rose-500/10 text-rose-600' :
                                            'bg-foreground/10 text-foreground/60'
                                    : 'text-foreground/20 hover:text-foreground/40'
                                    }`}
                            >
                                {sf === 'all' ? 'Todos' : sf === 'income' ? 'Entradas (+)' : 'Salidas (-)'}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {Object.keys(processedTransactions).length === 0 ? (
                <Card variant="outline" padding="lg" className="text-center border-dashed py-24 bg-foreground/[0.01]">
                    <div className="mx-auto h-20 w-20 text-foreground/10 mb-6 bg-foreground/[0.02] rounded-full flex items-center justify-center">
                        <LucideHistory size={40} />
                    </div>
                    <Typography variant="h3" className="mb-2 text-foreground">Sin movimientos</Typography>
                    <Typography variant="body" className="italic text-foreground/40 max-w-xs mx-auto">
                        {filter === 'all' ? 'No hay transacciones registradas aún.' : 'No se encontraron transacciones para este filtro.'}
                    </Typography>
                </Card>
            ) : (
                <div className="space-y-12">
                    {Object.entries(processedTransactions).map(([date, groupTxs]) => (
                        <div key={date} className="space-y-4">
                            <div className="flex items-center space-x-4 px-2">
                                <Typography variant="h3" className="text-foreground/30 font-black uppercase tracking-widest text-[10px] whitespace-nowrap">{date}</Typography>
                                <div className="h-px w-full bg-foreground/[0.05]" />
                            </div>
                            <ul className="space-y-4">
                                {groupTxs.map((t) => (
                                    <li key={t.id}>
                                        <Card
                                            variant={expandedId === t.id ? 'glass' : 'elevated'}
                                            padding="none"
                                            className={`overflow-hidden transition-all duration-300 ${expandedId === t.id ? 'ring-2 ring-blue-500/10 shadow-2xl scale-[1.01]' : 'hover:shadow-lg hover:scale-[1.005]'}`}
                                        >
                                            <div
                                                className={`px-6 py-5 cursor-pointer select-none ${editingId === t.id ? 'bg-blue-500/[0.02]' : ''}`}
                                                onClick={(e) => toggleExpand(t.id, e)}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center">
                                                        <div className={`flex-shrink-0 h-14 w-14 rounded-2xl shadow-sm flex items-center justify-center border-2 transition-all ${t.type === 'income' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' :
                                                            t.type === 'expense' ? 'bg-rose-500/10 text-rose-600 border-rose-500/20' :
                                                                'bg-blue-500/10 text-blue-600 border-blue-500/20'
                                                            }`}>
                                                            {t.type === 'income' ? <ArrowDownRight size={24} strokeWidth={2.5} /> :
                                                                t.type === 'expense' ? <ArrowUpLeft size={24} strokeWidth={2.5} /> :
                                                                    <ArrowLeftRight size={24} strokeWidth={2.5} />}
                                                        </div>
                                                        <div className="ml-5">
                                                            <Typography variant="h3" className={`font-black tracking-tight ${editingId === t.id ? 'text-blue-600' : 'text-foreground/90'}`}>
                                                                {t.description}
                                                            </Typography>
                                                            <div className="flex items-center space-x-3 mt-1">
                                                                <Typography variant="small" className="font-black text-[10px] opacity-40">
                                                                    {new Date(t.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                                                                </Typography>
                                                                <span className="h-1 w-1 rounded-full bg-foreground/20" />
                                                                <Typography variant="small" className="font-black text-[10px] opacity-40 uppercase tracking-widest">
                                                                    {t.account_name}
                                                                </Typography>
                                                                {(t.description.includes('[COBRO DEUDA]') || t.description.includes('[PAGO DEUDA]') || t.description.toLowerCase().includes('pago de deuda')) && (
                                                                    <>
                                                                        <span className="h-1 w-1 rounded-full bg-foreground/20" />
                                                                        <div className={`${t.type === 'income' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'} px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest`}>
                                                                            {t.type === 'income' ? 'Cobro Deuda' : 'Pago Deuda'}
                                                                        </div>
                                                                    </>
                                                                )}
                                                                {t.description.includes('[PRESTAMO RECIBIDO]') && (
                                                                    <>
                                                                        <span className="h-1 w-1 rounded-full bg-foreground/20" />
                                                                        <div className="bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest">Préstamo Recibido</div>
                                                                    </>
                                                                )}
                                                                {t.description.includes('[PRESTAMO OTORGADO]') && (
                                                                    <>
                                                                        <span className="h-1 w-1 rounded-full bg-foreground/20" />
                                                                        <div className="bg-rose-500/10 text-rose-600 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest">Préstamo Otorgado</div>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right flex items-center space-x-6">
                                                        <Typography
                                                            variant="h2"
                                                            className={`font-black tracking-tighter ${t.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' :
                                                                t.type === 'expense' ? 'text-rose-600 dark:text-rose-400' : 'text-blue-600 dark:text-blue-400'
                                                                }`}
                                                        >
                                                            {t.type === 'expense' ? '-' : '+'}{formatCurrency(t.amount)}
                                                        </Typography>
                                                        <ChevronDown
                                                            size={20}
                                                            className={`text-foreground/20 transition-all duration-300 ${expandedId === t.id || editingId === t.id ? 'rotate-180 text-blue-500 scale-125' : 'group-hover:text-foreground/40'}`}
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Detailed View / Edit Form */}
                                            {(expandedId === t.id || editingId === t.id) && (
                                                <div className="px-6 pb-6 animate-in fade-in slide-in-from-top-2 duration-500">
                                                    <div className="pt-6 border-t border-foreground/[0.03]">
                                                        {editingId === t.id ? (
                                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 p-2">
                                                                <div className="md:col-span-2">
                                                                    <InputField
                                                                        label="Descripción"
                                                                        value={editData.description}
                                                                        onChange={e => setEditData({ ...editData, description: e.target.value })}
                                                                    />
                                                                </div>
                                                                <InputField
                                                                    label="Monto"
                                                                    type="number"
                                                                    value={editData.amount}
                                                                    onChange={e => setEditData({ ...editData, amount: parseFloat(e.target.value) })}
                                                                />
                                                                <InputField
                                                                    label="Categoría"
                                                                    as="select"
                                                                    value={editData.category_id}
                                                                    onChange={e => setEditData({ ...editData, category_id: e.target.value })}
                                                                >
                                                                    <option value="">Selecciona Categoría</option>
                                                                    <optgroup label="Gastos">
                                                                        {categories.filter(c => c.type === 'expense').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                                    </optgroup>
                                                                    <optgroup label="Ingresos">
                                                                        {categories.filter(c => c.type === 'income').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                                    </optgroup>
                                                                </InputField>
                                                                <InputField
                                                                    label="Cuenta"
                                                                    as="select"
                                                                    value={editData.account_id}
                                                                    onChange={e => setEditData({ ...editData, account_id: e.target.value })}
                                                                >
                                                                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                                                </InputField>
                                                                <InputField
                                                                    label="Fecha"
                                                                    type="date"
                                                                    value={editData.date}
                                                                    onChange={e => setEditData({ ...editData, date: e.target.value })}
                                                                />

                                                                <div className="md:col-span-3 flex justify-end space-x-4 pt-6">
                                                                    <Button variant="ghost" size="sm" onClick={() => setEditingId(null)} className="text-foreground/40">
                                                                        <X size={16} className="mr-2" />
                                                                        Cancelar
                                                                    </Button>
                                                                    <Button size="sm" onClick={handleUpdate} isLoading={isUpdating} className="px-10 shadow-lg shadow-blue-500/20">
                                                                        <Save size={16} className="mr-2" />
                                                                        Guardar Cambios
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
                                                                    <div className="space-y-1">
                                                                        <Typography variant="small" className="opacity-30 font-black uppercase tracking-widest text-[10px]">Categoría</Typography>
                                                                        <Typography variant="body" className="font-bold text-foreground/80">{t.category_name || 'Sin categoría'}</Typography>
                                                                    </div>
                                                                    <div className="space-y-1">
                                                                        <Typography variant="small" className="opacity-30 font-black uppercase tracking-widest text-[10px]">Cuenta</Typography>
                                                                        <Typography variant="body" className="font-bold text-foreground/80">{t.account_name}</Typography>
                                                                    </div>
                                                                    <div className="space-y-1">
                                                                        <Typography variant="small" className="opacity-30 font-black uppercase tracking-widest text-[10px]">Usuario</Typography>
                                                                        <Typography variant="body" className="font-bold text-foreground/80">{t.user_name || 'Sistema'}</Typography>
                                                                    </div>
                                                                    <div className="space-y-1">
                                                                        <Typography variant="small" className="opacity-30 font-black uppercase tracking-widest text-[10px]">Estado</Typography>
                                                                        <div className="flex items-center space-x-2 text-emerald-600">
                                                                            <CheckCircle2 size={14} />
                                                                            <Typography variant="body" className="font-black text-[10px] uppercase tracking-widest">Confirmada</Typography>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="flex justify-end space-x-3">
                                                                    <Button variant="ghost" size="sm" className="text-foreground/40 hover:text-blue-600 hover:bg-blue-50/50 group transition-all rounded-xl" onClick={() => startEditing(t)}>
                                                                        <Edit2 size={16} className="mr-2 group-hover:scale-110 transition-transform" />
                                                                        Editar
                                                                    </Button>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="text-foreground/40 hover:text-rose-600 hover:bg-rose-50/50 group transition-all rounded-xl"
                                                                        onClick={() => handleDelete(t.id)}
                                                                        isLoading={isDeleting === t.id}
                                                                    >
                                                                        <Trash2 size={16} className="mr-2 group-hover:scale-110 transition-transform" />
                                                                        Eliminar
                                                                    </Button>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </Card>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default TransactionList;
