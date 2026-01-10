// src/app/transactions/TransactionList.tsx
'use client';

import React, { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
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
    History as LucideHistory,
    Paperclip,
    Loader2,
    Download,
    Image as ImageIcon,
    ExternalLink
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
    receipt_url?: string;
    target_account_id?: string;
    target_account_name?: string;
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
    const [uploadingReceipt, setUploadingReceipt] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);
    const [exportScope, setExportScope] = useState<'family' | 'personal'>('family');
    const [exportRange, setExportRange] = useState({
        start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
    });
    const [viewingReceipt, setViewingReceipt] = useState<string | null>(null);

    const uploadReceipt = async (file: File) => {
        setUploadingReceipt(true);
        try {
            const supabase = createClient();
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
            const filePath = `${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('receipts')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data } = supabase.storage.from('receipts').getPublicUrl(filePath);
            return data.publicUrl;
        } catch (error) {
            console.error('Error uploading receipt:', error);
            alert('Error al subir el comprobante.');
            return null;
        } finally {
            setUploadingReceipt(false);
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];

        const publicUrl = await uploadReceipt(file);
        if (publicUrl) {
            setEditData(prev => ({ ...prev, receipt_url: publicUrl }));
        }
    };

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
            target_account_id: t.target_account_id,
            date: t.date, // Keep full ISO string for datetime-local editing
            receipt_url: t.receipt_url,
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

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'}/transactions/export?scope=${exportScope}&start_date=${exportRange.start}&end_date=${exportRange.end}`;
            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });

            if (res.ok) {
                const blob = await res.blob();
                const downloadUrl = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = `audit_${exportScope}_${exportRange.start}_to_${exportRange.end}.pdf`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                setShowExportModal(false);
            } else {
                alert('Error al generar la exportación');
            }
        } catch (error) {
            console.error(error);
            alert('Error al exportar');
        } finally {
            setIsExporting(false);
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
        <div className="space-y-6 md:space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-2">
                <div className="flex p-1 bg-foreground/[0.03] rounded-2xl border border-foreground/[0.05] w-fit overflow-x-auto max-w-full no-scrollbar">
                    {(['all', 'income', 'expense', 'debts'] as const).map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-3.5 py-2 rounded-xl text-[10px] whitespace-nowrap font-black uppercase tracking-widest transition-all duration-300 ${filter === f
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

                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl font-black text-[10px] uppercase tracking-wider h-10 border-foreground/10"
                        onClick={() => setShowExportModal(true)}
                    >
                        <Download size={14} className="mr-2" />
                        Exportar PDF
                    </Button>
                </div>
            </div>

            {filter === 'debts' && (
                <div className="flex p-1 bg-foreground/[0.02] rounded-xl border border-foreground/[0.03] w-fit mx-auto md:mx-0 animate-in fade-in slide-in-from-left-2 duration-300">
                    {(['all', 'income', 'expense'] as const).map((sf) => (
                        <button
                            key={sf}
                            onClick={() => setDebtSubFilter(sf)}
                            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${debtSubFilter === sf
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
                <div className="space-y-8 md:space-y-12">
                    {Object.entries(processedTransactions).map(([date, groupTxs]) => (
                        <div key={date} className="space-y-3 md:space-y-4">
                            <div className="flex items-center space-x-4 px-2">
                                <Typography variant="h3" className="text-foreground/30 font-black uppercase tracking-widest text-[10px]">
                                    {date}
                                </Typography>
                                <div className="h-px w-full bg-foreground/[0.05]" />
                            </div>
                            <ul className="space-y-3 md:space-y-4">
                                {groupTxs.map((t) => (
                                    <li key={t.id}>
                                        <Card
                                            variant={expandedId === t.id ? 'glass' : 'elevated'}
                                            padding="none"
                                            className={`overflow-hidden transition-all duration-300 ${expandedId === t.id ? 'ring-2 ring-blue-500/10 shadow-2xl scale-[1.01]' : 'hover:shadow-lg hover:scale-[1.005]'}`}
                                        >
                                            <div
                                                className={`px-4 md:px-6 py-4 md:py-5 cursor-pointer select-none ${editingId === t.id ? 'bg-blue-500/[0.02]' : ''}`}
                                                onClick={(e) => toggleExpand(t.id, e)}
                                            >
                                                <div className="flex items-start md:items-center justify-between gap-3">
                                                    <div className="flex items-start md:items-center min-w-0 flex-1">
                                                        <div className={`flex-shrink-0 h-10 w-10 md:h-14 md:w-14 rounded-xl md:rounded-2xl shadow-sm flex items-center justify-center border-2 transition-all mt-0.5 md:mt-0 ${t.type === 'income' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' :
                                                            t.type === 'expense' ? 'bg-rose-500/10 text-rose-600 border-rose-500/20' :
                                                                'bg-blue-500/10 text-blue-600 border-blue-500/20'
                                                            }`}>
                                                            {t.type === 'income' ? <ArrowDownRight size={18} className="md:w-6 md:h-6" strokeWidth={2.5} /> :
                                                                t.type === 'expense' ? <ArrowUpLeft size={18} className="md:w-6 md:h-6" strokeWidth={2.5} /> :
                                                                    <ArrowLeftRight size={18} className="md:w-6 md:h-6" strokeWidth={2.5} />}
                                                        </div>
                                                        <div className="ml-3 md:ml-5 flex-1 min-w-0">
                                                            <div className="flex flex-col">
                                                                <Typography variant="h3" className={`font-black tracking-tight truncate md:text-lg leading-tight ${editingId === t.id ? 'text-blue-600' : 'text-foreground/90'}`}>
                                                                    {t.description}
                                                                </Typography>
                                                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                                                                    <Typography variant="small" className="font-black text-[9px] md:text-[11px] opacity-40 whitespace-nowrap">
                                                                        {new Date(t.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                                                                    </Typography>
                                                                    <span className="hidden md:block h-1 w-1 rounded-full bg-foreground/20 flex-shrink-0" />
                                                                    <Typography variant="small" className="font-black text-[9px] md:text-[11px] opacity-40 uppercase tracking-widest truncate max-w-[120px] md:max-w-none">
                                                                        {t.account_name}
                                                                    </Typography>
                                                                    {t.receipt_url && (
                                                                        <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-600 rounded text-[7px] md:text-[9px] font-black uppercase tracking-widest flex items-center flex-shrink-0" title="Ver Soporte">
                                                                            <ImageIcon size={8} className="mr-1 md:w-2.5 md:h-2.5" /> Soporte
                                                                        </span>
                                                                    )}
                                                                    {(t.description.includes('[COBRO DEUDA]') || t.description.includes('[PAGO DEUDA]') || t.description.toLowerCase().includes('pago de deuda')) && (
                                                                        <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-600 rounded text-[7px] md:text-[9px] font-black uppercase tracking-widest flex items-center flex-shrink-0">
                                                                            <ArrowLeftRight size={8} className="mr-1 md:w-2.5 md:h-2.5" /> Deuda
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right flex flex-col items-end md:flex-row md:items-center gap-1 md:gap-6 flex-shrink-0">
                                                        <Typography
                                                            variant="h3"
                                                            className={`font-black tracking-tighter text-base md:text-2xl ${t.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' :
                                                                t.type === 'expense' ? 'text-rose-600 dark:text-rose-400' : 'text-blue-600 dark:text-blue-400'
                                                                }`}
                                                        >
                                                            {t.type === 'expense' ? '-' : '+'}{formatCurrency(t.amount)}
                                                        </Typography>
                                                        <ChevronDown
                                                            size={20}
                                                            className={`text-foreground/20 transition-all duration-300 md:w-5 md:h-5 ${expandedId === t.id || editingId === t.id ? 'rotate-180 text-blue-500 scale-125' : 'group-hover:text-foreground/40'}`}
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
                                                                    label="Tipo"
                                                                    as="select"
                                                                    value={editData.type}
                                                                    onChange={e => setEditData({ ...editData, type: e.target.value as any })}
                                                                >
                                                                    <option value="expense">Gasto</option>
                                                                    <option value="income">Ingreso</option>
                                                                    <option value="transfer">Transferencia</option>
                                                                </InputField>
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

                                                                {editData.type === 'transfer' && (
                                                                    <InputField
                                                                        label="Cuenta Destino"
                                                                        as="select"
                                                                        value={editData.target_account_id || ''}
                                                                        onChange={e => setEditData({ ...editData, target_account_id: e.target.value })}
                                                                    >
                                                                        <option value="">Selecciona cuenta</option>
                                                                        {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                                                    </InputField>
                                                                )}

                                                                <InputField
                                                                    label="Fecha y Hora"
                                                                    type="datetime-local"
                                                                    // Format ISO string to YYYY-MM-DDTHH:mm for input
                                                                    value={editData.date ? new Date(editData.date).toLocaleTimeString('en-CA', { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(', ', 'T') : ''}
                                                                    onChange={e => {
                                                                        // Convert back to ISO string on change
                                                                        const date = new Date(e.target.value);
                                                                        setEditData({ ...editData, date: date.toISOString() });
                                                                    }}
                                                                />

                                                                <div className="md:col-span-3 pt-2">
                                                                    <label className="block text-sm font-bold text-foreground mb-2">Comprobante</label>
                                                                    <div className="flex items-center space-x-4">
                                                                        <div className="relative">
                                                                            <input
                                                                                type="file"
                                                                                accept="image/*,application/pdf"
                                                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                                                onChange={handleFileChange}
                                                                                disabled={uploadingReceipt}
                                                                            />
                                                                            <Button variant="outline" size="sm" type="button" disabled={uploadingReceipt}>
                                                                                {uploadingReceipt ? <Loader2 size={14} className="animate-spin mr-2" /> : <Paperclip size={14} className="mr-2" />}
                                                                                {uploadingReceipt ? 'Subiendo...' : 'Cambiar/Subir Recibo'}
                                                                            </Button>
                                                                        </div>
                                                                        {editData.receipt_url && (
                                                                            <div className="text-xs text-blue-600 truncate max-w-[200px] flex items-center">
                                                                                <CheckCircle2 size={12} className="mr-1" /> Recibo adjunto
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>

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
                                                                    {t.receipt_url && (
                                                                        <div className="space-y-1">
                                                                            <Typography variant="small" className="opacity-30 font-black uppercase tracking-widest text-[10px]">Comprobante</Typography>
                                                                            <button
                                                                                onClick={() => setViewingReceipt(t.receipt_url!)}
                                                                                className="flex items-center space-x-2 text-blue-600 hover:text-blue-700 font-bold text-xs group"
                                                                            >
                                                                                <ImageIcon size={14} className="group-hover:scale-110 transition-transform" />
                                                                                <span>Ver Soporte</span>
                                                                            </button>
                                                                        </div>
                                                                    )}
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
                    {/* Export Modal */}
                    {showExportModal && (
                        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                            <Card variant="elevated" className="w-full max-w-md animate-in fade-in zoom-in duration-300 overflow-visible">
                                <div className="flex justify-between items-center mb-6">
                                    <Typography variant="h3" className="font-black">Exportar Auditoría</Typography>
                                    <Button variant="ghost" size="sm" onClick={() => setShowExportModal(false)} className="p-0 h-8 w-8">
                                        <X size={20} />
                                    </Button>
                                </div>

                                <div className="space-y-6">
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-foreground/40">Alcance</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <Button
                                                variant={exportScope === 'family' ? 'primary' : 'outline'}
                                                onClick={() => setExportScope('family')}
                                                className="text-[10px] font-black uppercase h-12"
                                            >
                                                Familiar (Todo)
                                            </Button>
                                            <Button
                                                variant={exportScope === 'personal' ? 'primary' : 'outline'}
                                                onClick={() => setExportScope('personal')}
                                                className="text-[10px] font-black uppercase h-12"
                                            >
                                                Personal (Mío)
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <InputField
                                            label="Desde"
                                            type="date"
                                            value={exportRange.start}
                                            onChange={e => setExportRange({ ...exportRange, start: e.target.value })}
                                        />
                                        <InputField
                                            label="Hasta"
                                            type="date"
                                            value={exportRange.end}
                                            onChange={e => setExportRange({ ...exportRange, end: e.target.value })}
                                        />
                                    </div>

                                    <Button
                                        className="w-full h-14 font-black uppercase tracking-widest text-xs shadow-xl shadow-blue-500/20"
                                        onClick={handleExport}
                                        isLoading={isExporting}
                                    >
                                        <Download size={18} className="mr-2" />
                                        Descargar CSV
                                    </Button>
                                </div>
                            </Card>
                        </div>
                    )}

                    {/* Receipt Modal */}
                    {viewingReceipt && (
                        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[101] flex items-center justify-center p-4 md:p-10">
                            <div className="absolute top-6 right-6 flex items-center space-x-4">
                                <a
                                    href={viewingReceipt}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="bg-white/10 hover:bg-white/20 text-white p-3 rounded-2xl transition-all"
                                    title="Abrir en nueva pestaña"
                                >
                                    <ExternalLink size={24} />
                                </a>
                                <button
                                    onClick={() => setViewingReceipt(null)}
                                    className="bg-white/10 hover:bg-white/20 text-white p-3 rounded-2xl transition-all"
                                >
                                    <X size={24} />
                                </button>
                            </div>

                            <div className="w-full h-full flex items-center justify-center animate-in zoom-in fade-in duration-500">
                                {viewingReceipt.toLowerCase().endsWith('.pdf') ? (
                                    <iframe src={viewingReceipt} className="w-full h-full rounded-3xl" border-0 />
                                ) : (
                                    <img
                                        src={viewingReceipt}
                                        alt="Soporte de transacción"
                                        className="max-w-full max-h-full object-contain rounded-3xl shadow-2xl"
                                    // eslint-disable-next-line @next/next/no-img-element
                                    />
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )
            }
        </div >
    );
};

export default TransactionList;
