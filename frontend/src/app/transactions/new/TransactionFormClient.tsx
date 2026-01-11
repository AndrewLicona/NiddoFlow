'use client';

import React, { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { createTransaction } from '../actions';
import { SubmitButton } from '@/components/ui/molecules/SubmitButton';
import { Card } from '@/components/ui/molecules/Card';
import { Typography } from '@/components/ui/atoms/Typography';
import { Button } from '@/components/ui/atoms/Button';
import { InputField } from '@/components/ui/molecules/InputField';
import { formatCurrency } from '@/utils/format';
import { Save, X, Plus, Paperclip, Loader2, Trash2 } from 'lucide-react';
import Link from 'next/link';

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
    categories: Category[];
    accounts: Account[];
}

export default function TransactionFormClient({ categories, accounts }: Props) {
    const [uploading, setUploading] = useState(false);
    const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
    const [filePreview, setFilePreview] = useState<string | null>(null);
    const [receiptFile, setReceiptFile] = useState<File | null>(null);
    const [type, setType] = useState<string>('expense');

    const incomeCategories = categories.filter((c: Category) => c.type === 'income');
    const expenseCategories = categories.filter((c: Category) => c.type === 'expense');

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) {
            return;
        }
        const file = e.target.files[0];
        setReceiptFile(file);
        setFilePreview(URL.createObjectURL(file));

        // Auto upload on select
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
            alert('Error al subir el comprobante. Inténtalo de nuevo.');
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

    return (
        <Card variant="elevated" className="mt-8 border-indigo-500/5 overflow-hidden">
            <form action={createTransaction} className="space-y-10 p-2">
                {/* Hidden input to send the URL to the server action */}
                <input type="hidden" name="receipt_url" value={receiptUrl || ''} />

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
                            value={type}
                            onChange={(e) => setType(e.target.value)}
                        >
                            <option value="expense">Gasto (Egreso)</option>
                            <option value="income">Ingreso (Entrada)</option>
                            <option value="transfer">Transferencia</option>
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
                                {accounts.map((a: Account) => (
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

                    {/* Target Account (Only for Transfers) */}
                    {type === 'transfer' && (
                        <div className="md:col-span-1 animate-in fade-in slide-in-from-top-2 duration-300">
                            <InputField
                                label="Cuenta Destino"
                                name="targetAccountId"
                                as="select"
                                required
                            >
                                <option value="">Selecciona cuenta destino</option>
                                {accounts.map((a: Account) => (
                                    <option key={a.id} value={a.id}>{a.name} ({formatCurrency(a.balance)})</option>
                                ))}
                            </InputField>
                        </div>
                    )}

                    {/* Category */}
                    <div className="md:col-span-1">
                        <InputField
                            label="Categoría"
                            name="categoryId"
                            as="select"
                        >
                            <optgroup label="Gastos Comunes">
                                {expenseCategories.map((c: Category) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </optgroup>
                            <optgroup label="Fuentes de Ingreso">
                                {incomeCategories.map((c: Category) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </optgroup>
                        </InputField>
                    </div>

                    {/* Receipt Upload */}
                    <div className="md:col-span-2">
                        <label className="block text-sm font-bold text-foreground mb-2">
                            Comprobante / Recibo (Opcional)
                        </label>

                        {!filePreview ? (
                            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-foreground/10 border-dashed rounded-2xl hover:border-blue-500/50 hover:bg-blue-500/5 transition-all group cursor-pointer relative">
                                <input
                                    type="file"
                                    accept="image/*,application/pdf"
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                    onChange={handleFileChange}
                                    disabled={uploading}
                                />
                                <div className="space-y-2 text-center">
                                    <div className="mx-auto h-12 w-12 text-foreground/20 group-hover:text-blue-500 transition-colors flex items-center justify-center rounded-full bg-foreground/5 group-hover:bg-blue-500/10">
                                        {uploading ? <Loader2 className="animate-spin" size={24} /> : <Paperclip size={24} />}
                                    </div>
                                    <div className="flex text-sm text-foreground/60 justify-center">
                                        <span className="relative cursor-pointer rounded-md font-bold text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500">
                                            {uploading ? 'Subiendo...' : 'Sube un archivo'}
                                        </span>
                                        <p className="pl-1">o arrastra y suelta</p>
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
                                    <Trash2 size={18} />
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Date with Time */}
                    <div className="md:col-span-2">
                        <InputField
                            label="Fecha y Hora"
                            name="date"
                            type="datetime-local"
                            required
                            defaultValue={new Date().toISOString().slice(0, 16)}
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
                    <SubmitButton
                        variant="primary"
                        className="order-1 md:order-2 w-full md:w-auto px-10 shadow-xl shadow-blue-500/10"
                        icon={<Save size={18} />}
                        loadingText="Guardando..."
                    >
                        Guardar Transacción
                    </SubmitButton>
                </div>
            </form>
        </Card>
    );
}
