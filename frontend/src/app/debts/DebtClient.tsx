'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { formatCurrency } from '@/utils/format';
import { Typography } from '@/components/ui/atoms/Typography';
import { Button } from '@/components/ui/atoms/Button';
import { Card } from '@/components/ui/molecules/Card';
import { InputField } from '@/components/ui/molecules/InputField';
import { ArrowUpRight, ArrowDownLeft, Plus, Trash2, CheckCircle, Calendar, Info, AlertCircle, Paperclip, Loader2, X, Save } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { payDebt, createDebt, deleteDebt } from './actions';
import { SubmitButton } from '@/components/ui/molecules/SubmitButton';

interface Debt {
    id: string;
    description: string;
    total_amount: number;
    remaining_amount: number;
    type: 'to_pay' | 'to_receive';
    status: 'active' | 'paid';
    category_id: string | null;
    account_id?: string | null;
    due_date: string | null;
}

interface Account {
    id: string;
    name: string;
    balance: number;
}

interface Category {
    id: string;
    name: string;
    type: 'income' | 'expense';
}

interface Props {
    initialDebts: Debt[];
    accounts: Account[];
    categories: Category[];
    token: string;
}

export default function DebtClient({ initialDebts, accounts, categories }: Props) {
    const [debts, setDebts] = useState<Debt[]>(initialDebts);

    useEffect(() => {
        setDebts(initialDebts);
    }, [initialDebts]);
    const [isCreating, setIsCreating] = useState(false);
    const [payingDebt, setPayingDebt] = useState<Debt | null>(null);
    const [paymentData, setPaymentData] = useState({
        amount: '',
        accountId: accounts[0]?.id || '',
        categoryId: '',
        description: ''
    });
    const [newDebt, setNewDebt] = useState({
        description: '',
        total_amount: '',
        type: 'to_pay' as 'to_pay' | 'to_receive',
        category_id: '',
        account_id: '',
        due_date: ''
    });

    const paymentFormRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (payingDebt && paymentFormRef.current) {
            paymentFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [payingDebt]);

    // Receipt Upload State
    const [uploading, setUploading] = useState(false);
    const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
    const [filePreview, setFilePreview] = useState<string | null>(null);
    const [receiptFile, setReceiptFile] = useState<File | null>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        setReceiptFile(file);
        setFilePreview(URL.createObjectURL(file));
        await uploadReceipt(file);
    };

    const uploadReceipt = async (file: File) => {
        setUploading(true);
        try {
            const supabase = createClient();
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
            const filePath = `${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('receipts')
                .upload(filePath, file, {
                    cacheControl: '3600',
                    upsert: true
                });

            if (uploadError) {
                console.error('Upload error details:', uploadError);
                throw uploadError;
            }

            const { data } = supabase.storage.from('receipts').getPublicUrl(filePath);
            setReceiptUrl(data.publicUrl);
        } catch (error) {
            console.error('Error uploading receipt:', error);
            alert('Error al subir el comprobante.');
            setReceiptFile(null);
            setFilePreview(null);
        } finally {
            setUploading(false);
        }
    };

    const clearReceipt = () => {
        setReceiptFile(null);
        setFilePreview(null);
        setReceiptUrl(null);
    };

    const stats = useMemo(() => {
        const toPay = debts
            .filter(d => d.type === 'to_pay' && d.status === 'active')
            .reduce((acc, d) => acc + d.remaining_amount, 0);

        const toReceive = debts
            .filter(d => d.type === 'to_receive' && d.status === 'active')
            .reduce((acc, d) => acc + d.remaining_amount, 0);

        return { toPay, toReceive };
    }, [debts]);

    const handleCreateDebt = async (formData: FormData) => {
        try {
            await createDebt(formData);
            setIsCreating(false);
            setNewDebt({ description: '', total_amount: '', type: 'to_pay', category_id: '', account_id: '', due_date: '' });
        } catch (error) {
            console.error('Error creating debt:', error);
        }
    };

    const handleRecordPayment = async (formData: FormData) => {
        if (!payingDebt) return;
        try {
            const amountValue = formData.get('amount') as string;
            const amount = parseFloat(amountValue);

            const result = await payDebt({
                debtId: payingDebt.id,
                accountId: formData.get('accountId') as string,
                categoryId: formData.get('categoryId') as string,
                amount: amount,
                description: (formData.get('description') as string) || `Pago de deuda: ${payingDebt.description}`,
                type: payingDebt.type,
                receiptUrl: receiptUrl
            });

            if (result.success) {
                setPayingDebt(null);
                setPaymentData({
                    amount: '',
                    accountId: accounts[0]?.id || '',
                    categoryId: '',
                    description: ''
                });
                clearReceipt();
            }
        } catch (error) {
            console.error('Error recording payment:', error);
        }
    };

    const handleDeleteDebt = async (id: string) => {
        if (!confirm('¿Estás seguro de eliminar este registro?')) return;
        try {
            await deleteDebt(id);
        } catch (error) {
            console.error('Error deleting debt:', error);
        }
    };

    return (
        <div className="space-y-8 pb-32">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <Card variant="elevated" className="border-l-4 border-l-rose-500 bg-rose-500/[0.01]">
                    <div className="flex items-center space-x-2 mb-2">
                        <ArrowUpRight size={14} className="text-rose-500" />
                        <Typography variant="body" className="text-rose-500 font-black uppercase tracking-widest text-[10px]">Total por Pagar</Typography>
                    </div>
                    <Typography variant="h1" className="text-rose-600 font-black tracking-tighter">
                        {formatCurrency(stats.toPay)}
                    </Typography>
                </Card>
                <Card variant="elevated" className="border-l-4 border-l-emerald-500 bg-emerald-500/[0.01]">
                    <div className="flex items-center space-x-2 mb-2">
                        <ArrowDownLeft size={14} className="text-emerald-500" />
                        <Typography variant="body" className="text-emerald-500 font-black uppercase tracking-widest text-[10px]">Total por Recibir</Typography>
                    </div>
                    <Typography variant="h1" className="text-emerald-600 font-black tracking-tighter">
                        {formatCurrency(stats.toReceive)}
                    </Typography>
                </Card>
            </div>

            <div className="flex justify-between items-center px-2">
                <Typography variant="h3" className="flex items-center space-x-2">
                    <Info size={18} className="text-foreground/20" />
                    <span>Compromisos Pendientes</span>
                </Typography>
                {!isCreating && (
                    <Button onClick={() => setIsCreating(true)} size="sm" variant="outline" className="border-foreground/10 hover:bg-foreground/5 transition-all">
                        <Plus size={16} className="mr-2" />
                        Agregar Registro
                    </Button>
                )}
            </div>

            {isCreating && (
                <Card variant="glass" className="animate-in fade-in slide-in-from-top-4 duration-500 border-indigo-500/10 shadow-2xl">
                    <div className="flex items-center space-x-3 mb-8">
                        <div className="p-2 bg-indigo-500/10 rounded-xl">
                            <Plus size={20} className="text-indigo-600" />
                        </div>
                        <Typography variant="h3">Nuevo Registro Financiero</Typography>
                    </div>
                    <form action={handleCreateDebt} className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="md:col-span-2">
                            <InputField
                                label="¿Qué es este registro?"
                                placeholder="Ej: Préstamo de Juan, Deuda de servicios..."
                                value={newDebt.description}
                                name="description"
                                onChange={(e) => setNewDebt({ ...newDebt, description: e.target.value })}
                                required
                            />
                        </div>
                        <InputField
                            label="Monto"
                            type="number"
                            placeholder="0.00"
                            value={newDebt.total_amount}
                            name="total_amount"
                            onChange={(e) => setNewDebt({ ...newDebt, total_amount: e.target.value })}
                            required
                        />
                        <InputField
                            label="Naturaleza"
                            as="select"
                            value={newDebt.type}
                            name="type"
                            onChange={(e) => setNewDebt({ ...newDebt, type: e.target.value as 'to_pay' | 'to_receive' })}
                        >
                            <option value="to_pay">Préstamo Otorgado (Yo presté dinero - Salida)</option>
                            <option value="to_receive">Préstamo Recibido (Me prestaron - Entrada)</option>
                        </InputField>
                        <InputField
                            label="Categoría (Opcional)"
                            as="select"
                            value={newDebt.category_id}
                            name="category_id"
                            onChange={(e) => setNewDebt({ ...newDebt, category_id: e.target.value })}
                        >
                            <option value="">Automática (Préstamos)</option>
                            {categories
                                .filter(c => newDebt.type === 'to_pay' ? c.type === 'expense' : c.type === 'income')
                                .map(cat => (
                                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                                ))
                            }
                        </InputField>
                        <InputField
                            label="Cuenta del Movimiento (Opcional)"
                            as="select"
                            value={newDebt.account_id}
                            name="account_id"
                            onChange={(e) => setNewDebt({ ...newDebt, account_id: e.target.value })}
                        >
                            <option value="">Ninguna (No crea transacción)</option>
                            {accounts.map(acc => (
                                <option key={acc.id} value={acc.id}>{acc.name}</option>
                            ))}
                        </InputField>
                        <InputField
                            label="Fecha Límite (Opcional)"
                            type="date"
                            value={newDebt.due_date}
                            name="due_date"
                            onChange={(e) => setNewDebt({ ...newDebt, due_date: e.target.value })}
                        />
                        <div className="flex justify-end space-x-4 md:col-span-2 pt-4">
                            <Button type="button" variant="ghost" onClick={() => setIsCreating(false)} className="text-foreground/40 hover:text-foreground">
                                Cancelar
                            </Button>
                            <SubmitButton icon={<Save size={18} />} className="shadow-lg shadow-indigo-500/20 px-8">
                                Registrar Ahora
                            </SubmitButton>
                        </div>
                    </form>
                </Card>
            )}

            {payingDebt && (
                <div ref={paymentFormRef} className="scroll-mt-32">
                    <Card variant="glass" className="animate-in fade-in zoom-in-95 duration-300 border-emerald-500/10 shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-5">
                            <CheckCircle size={120} />
                        </div>
                        <div className="flex items-center space-x-3 mb-8">
                            <div className="p-2 bg-emerald-500/10 rounded-xl">
                                <CheckCircle size={20} className="text-emerald-600" />
                            </div>
                            <div>
                                <Typography variant="h3">Registrar Pago / Abono</Typography>
                                <Typography variant="small" className="opacity-50">Deuda: {payingDebt.description}</Typography>
                            </div>
                        </div>
                        <form action={handleRecordPayment} className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                            <InputField
                                label="Monto del Pago"
                                type="number"
                                placeholder="0.00"
                                value={paymentData.amount}
                                name="amount"
                                onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
                                required
                            />
                            <InputField
                                label="Cuenta de Origen/Destino"
                                as="select"
                                value={paymentData.accountId}
                                name="accountId"
                                onChange={(e) => setPaymentData({ ...paymentData, accountId: e.target.value })}
                                required
                                disabled={!!payingDebt.account_id}
                            >
                                <option value="">Selecciona una cuenta</option>
                                {accounts.map(acc => (
                                    <option key={acc.id} value={acc.id}>{acc.name} ({formatCurrency(acc.balance)})</option>
                                ))}
                            </InputField>
                            {!!payingDebt.account_id && (
                                <div className="flex items-center space-x-2 text-indigo-500 text-xs mt-1 md:col-span-1">
                                    <AlertCircle size={12} />
                                    <span className="font-bold">Cuenta vinculada obligatoria</span>
                                </div>
                            )}
                            <InputField
                                label="Categoría (Opcional)"
                                as="select"
                                value={paymentData.categoryId}
                                name="categoryId"
                                onChange={(e) => setPaymentData({ ...paymentData, categoryId: e.target.value })}
                            >
                                <option value="">Automática (Abonos/Pagos)</option>
                                {categories
                                    .filter(c => payingDebt.type === 'to_pay' ? c.type === 'expense' : c.type === 'income')
                                    .map(cat => (
                                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                                    ))
                                }
                            </InputField>
                            <div className="md:col-span-2">
                                <InputField
                                    label="Descripción (Opcional)"
                                    placeholder="Ej: Abono quincenal..."
                                    value={paymentData.description}
                                    name="description"
                                    onChange={(e) => setPaymentData({ ...paymentData, description: e.target.value })}
                                />
                            </div>

                            {/* Receipt Upload */}
                            <div className="md:col-span-2">
                                <label className="block text-sm font-bold text-foreground mb-2">
                                    Comprobante / Recibo (Opcional)
                                </label>

                                {!filePreview ? (
                                    <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-foreground/10 border-dashed rounded-2xl hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all group cursor-pointer relative">
                                        <input
                                            type="file"
                                            accept="image/*,application/pdf"
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                            onChange={handleFileChange}
                                            disabled={uploading}
                                        />
                                        <div className="space-y-2 text-center">
                                            <div className="mx-auto h-12 w-12 text-foreground/20 group-hover:text-emerald-500 transition-colors flex items-center justify-center rounded-full bg-foreground/5 group-hover:bg-emerald-500/10">
                                                {uploading ? <Loader2 className="animate-spin" size={24} /> : <Paperclip size={24} />}
                                            </div>
                                            <div className="flex text-sm text-foreground/60 justify-center">
                                                <span className="relative cursor-pointer rounded-md font-bold text-emerald-600 hover:text-emerald-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500">
                                                    {uploading ? 'Subiendo...' : 'Sube un archivo'}
                                                </span>
                                            </div>
                                            <p className="text-xs text-foreground/40">
                                                PNG, JPG, PDF hasta 5MB
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="relative mt-2 rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-4 flex items-center justify-between">
                                        <div className="flex items-center space-x-4">
                                            <div className="h-16 w-16 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center overflow-hidden border border-foreground/5">
                                                {receiptFile?.type.startsWith('image/') ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img src={filePreview} alt="Preview" className="h-full w-full object-cover" />
                                                ) : (
                                                    <Paperclip className="text-blue-500" size={24} />
                                                )}
                                            </div>
                                            <div>
                                                <Typography variant="body" className="font-bold text-foreground text-sm truncate max-w-[200px]">
                                                    {receiptFile?.name}
                                                </Typography>
                                                <Typography variant="small" className="text-green-600 font-bold text-[10px] uppercase flex items-center mt-1">
                                                    {uploading ? (
                                                        <><Loader2 size={10} className="mr-1 animate-spin" /> Subiendo...</>
                                                    ) : (
                                                        <>Listo para guardar</>
                                                    )}
                                                </Typography>
                                            </div>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={clearReceipt}
                                            className="text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                                        >
                                            <X size={18} />
                                        </Button>
                                    </div>
                                )}
                            </div>
                            <div className="flex justify-end space-x-4 md:col-span-2 pt-4">
                                <Button type="button" variant="ghost" onClick={() => setPayingDebt(null)} className="text-foreground/40 hover:text-foreground">
                                    Cancelar
                                </Button>
                                <SubmitButton icon={<CheckCircle size={18} />} variant="primary" className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20 px-8">
                                    Confirmar Pago
                                </SubmitButton>
                            </div>
                        </form>
                    </Card>
                </div>
            )}

            <div className="space-y-4">
                {debts.length === 0 ? (
                    <Card variant="outline" padding="lg" className="text-center py-24 border-dashed border-foreground/10 bg-foreground/[0.01]">
                        <div className="mx-auto h-20 w-20 text-foreground/10 mb-6 bg-foreground/[0.02] rounded-full flex items-center justify-center">
                            <Calendar size={40} />
                        </div>
                        <Typography variant="h3" className="mb-2">Todo en orden</Typography>
                        <Typography variant="body" className="text-foreground/40 mb-10 max-w-xs mx-auto">
                            No tienes deudas o cuentas por cobrar registradas actualmente.
                        </Typography>
                        <Button onClick={() => setIsCreating(true)} variant="outline">
                            <Plus size={18} className="mr-2" />
                            Agregar Primer Compromiso
                        </Button>
                    </Card>
                ) : (
                    debts.map(debt => (
                        <Card
                            key={debt.id}
                            variant={debt.status === 'paid' ? 'flat' : 'elevated'}
                            className={`group transition-all duration-300 ${debt.status === 'paid' ? 'opacity-40 grayscale-[0.5]' : 'hover:scale-[1.005] hover:shadow-xl'}`}
                        >
                            <div className="flex flex-col gap-4 md:gap-6">
                                {/* Top Row: Icon, Description and Amount */}
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-center space-x-4 min-w-0">
                                        <div className={`p-3 md:p-4 rounded-xl md:rounded-2xl shadow-sm transition-colors flex-shrink-0 ${debt.status === 'paid' ? 'bg-foreground/[0.05] text-foreground/20' :
                                            debt.type === 'to_pay' ? 'bg-rose-500/[0.08] text-rose-600 border border-rose-500/10' :
                                                'bg-emerald-500/[0.08] text-emerald-600 border border-emerald-500/10'
                                            }`}>
                                            {debt.type === 'to_pay' ? <ArrowUpRight size={20} className="md:w-6 md:h-6" /> : <ArrowDownLeft size={20} className="md:w-6 md:h-6" />}
                                        </div>
                                        <div className="min-w-0">
                                            <Typography variant="h3" className={`font-black tracking-tight truncate md:text-lg leading-tight ${debt.status === 'paid' ? 'line-through opacity-50' : 'text-foreground/90'}`}>
                                                {debt.description}
                                            </Typography>

                                            {debt.status === 'active' && (
                                                <div className={`inline-flex items-center space-x-1.5 px-2 py-0.5 mt-1 rounded-full text-[9px] md:text-[10px] font-black uppercase tracking-widest ${debt.type === 'to_pay' ? 'bg-rose-500/10 text-rose-600' : 'bg-emerald-500/10 text-emerald-600'
                                                    }`}>
                                                    <span className="relative flex h-1.5 w-1.5">
                                                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${debt.type === 'to_pay' ? 'bg-rose-400' : 'bg-emerald-400'}`}></span>
                                                        <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${debt.type === 'to_pay' ? 'bg-rose-500' : 'bg-emerald-500'}`}></span>
                                                    </span>
                                                    <span>Pendiente</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="text-right flex-shrink-0">
                                        <Typography variant="h2" className={`font-black tracking-tighter text-xl md:text-3xl ${debt.status === 'paid' ? 'text-foreground/20' :
                                            debt.type === 'to_pay' ? 'text-rose-600' : 'text-emerald-600'
                                            }`}>
                                            {formatCurrency(debt.total_amount)}
                                        </Typography>
                                    </div>
                                </div>

                                {/* Divider for mobile only */}
                                <div className="h-px w-full bg-foreground/[0.03] md:hidden" />

                                {/* Bottom Row/Area: Metadata and Actions */}
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <Typography variant="muted" className="text-[10px] md:text-xs font-medium">
                                            {debt.status === 'paid' ? (
                                                <span className="flex items-center text-emerald-600/60 font-black uppercase tracking-widest">
                                                    <CheckCircle size={12} className="mr-1" /> Finalizado
                                                </span>
                                            ) : (
                                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 opacity-60">
                                                    <div className="flex items-center">
                                                        <span className="opacity-50 mr-1.5">Saldo:</span>
                                                        <span className="font-bold text-foreground/60">{formatCurrency(debt.remaining_amount)}</span>
                                                    </div>
                                                    <span className="hidden md:block opacity-30">•</span>
                                                    <div className="font-bold text-foreground/60 uppercase tracking-widest text-[9px]">{categories.find(c => c.id === debt.category_id)?.name || 'General'}</div>
                                                    {debt.due_date && (
                                                        <>
                                                            <span className="hidden md:block opacity-30">•</span>
                                                            <div className="inline-flex items-center font-bold text-foreground/60">
                                                                <Calendar size={12} className="mr-1 opacity-40" />
                                                                {new Date(debt.due_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </Typography>
                                    </div>

                                    <div className="flex items-center space-x-2 w-full md:w-auto">
                                        {debt.status === 'active' && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => {
                                                    setPayingDebt(debt);
                                                    setPaymentData({
                                                        ...paymentData,
                                                        amount: debt.remaining_amount.toString(),
                                                        accountId: debt.account_id || accounts[0]?.id || ''
                                                    });
                                                }}
                                                className="flex-1 md:flex-none border-emerald-500/20 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-xl shadow-lg shadow-emerald-500/5 transition-all font-black text-xs h-10 px-6"
                                            >
                                                <CheckCircle size={16} className="mr-2" />
                                                Registrar Pago
                                            </Button>
                                        )}
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="bg-foreground/[0.02] text-foreground/20 hover:text-rose-500 hover:bg-rose-500/10 h-10 w-10 flex items-center justify-center rounded-xl md:rounded-2xl flex-shrink-0"
                                            onClick={() => handleDeleteDebt(debt.id)}
                                        >
                                            <Trash2 size={18} />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
}
