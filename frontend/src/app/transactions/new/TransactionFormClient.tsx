'use client';

import React, { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { createTransaction } from '../actions';
import { SubmitButton } from '@/components/ui/molecules/SubmitButton';
import { Card } from '@/components/ui/molecules/Card';
import { Typography } from '@/components/ui/atoms/Typography';
import { Button } from '@/components/ui/atoms/Button';
import { InputField } from '@/components/ui/molecules/InputField';
import OcrItemsEditor, { type OcrItem } from '@/components/ui/molecules/OcrItemsEditor';
import { useCategories } from '@/hooks/useCategories';
import { useOcrExtract } from '@/hooks/useOcr';
import { formatCurrency } from '@/utils/format';
import { normalizeQuantity, roundMoney } from '@/utils/numbers';
import { Save, X, Plus, Paperclip, Loader2, Trash2, Store, AlertTriangle } from 'lucide-react';
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

interface OcrInstallments {
    current: number | null;
    total: number | null;
    purchase_total_amount: number | null;
}

const CONFIDENCE_LABELS: Record<string, string> = {
    amount: 'Monto',
    date: 'Fecha',
    merchant: 'Comercio',
    total: 'Total',
};

export default function TransactionFormClient({ categories, accounts }: Props) {
    const [uploading, setUploading] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
    const [filePreview, setFilePreview] = useState<string | null>(null);
    const [receiptFile, setReceiptFile] = useState<File | null>(null);
    const [type, setType] = useState<string>('expense');

    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [categoryId, setCategoryId] = useState('');

    // Datos del OCR que ahora sí se conservan y persisten.
    const [items, setItems] = useState<OcrItem[]>([]);
    const [merchant, setMerchant] = useState('');
    const [source, setSource] = useState<'manual' | 'ocr'>('manual');
    const [ocrConfidence, setOcrConfidence] = useState<Record<string, number>>({});
    const [isDuplicate, setIsDuplicate] = useState(false);
    const [duplicateOf, setDuplicateOf] = useState<string | null>(null);
    const [installments, setInstallments] = useState<OcrInstallments | null>(null);
    const [imageHash, setImageHash] = useState<string | null>(null);

    const { createCategoryRule } = useCategories();
    const extractReceipt = useOcrExtract();

    // Helper to format number with dots (thousands separators)
    const formatNumber = (value: string) => {
        const rawValue = value.replace(/\D/g, '');
        if (!rawValue) return '';
        return new Intl.NumberFormat('es-CO').format(parseInt(rawValue));
    };

    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        const formattedValue = formatNumber(value);
        setAmount(formattedValue);
    };

    const incomeCategories = categories.filter((c: Category) => c.type === 'income');
    const expenseCategories = categories.filter((c: Category) => c.type === 'expense');
    const [date, setDate] = useState('');

    React.useEffect(() => {
        const now = new Date();
        const localIso = new Date(now.getTime() - (now.getTimezoneOffset() * 60000))
            .toISOString()
            .slice(0, 16);
        setDate(localIso);
    }, []);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {

        if (!e.target.files || e.target.files.length === 0) {
            return;
        }
        const file = e.target.files[0];
        setReceiptFile(file);
        setFilePreview(URL.createObjectURL(file));

        // Auto upload on select
        uploadReceipt(file);
        // Autocompleta los datos con OpenAI
        scanReceipt(file);
    };

    const scanReceipt = async (file: File) => {
        setIsScanning(true);
        try {
            const data = await extractReceipt.mutateAsync(file);

            // Procedencia de los datos: a partir de aquí la factura viene del OCR.
            setSource('ocr');

            // Set Nature (Type)
            if (data.nature) {
                const natureMap: Record<string, string> = {
                    'Ingreso': 'income',
                    'Gasto': 'expense',
                    'Transferencia': 'transfer'
                };
                const mappedType = natureMap[data.nature];
                if (mappedType) setType(mappedType);
            }

            if (data.amount) {
                const formatted = formatNumber(Math.floor(data.amount).toString());
                setAmount(formatted);
            }
            if (data.description) setDescription(data.description);
            if (data.date) setDate(data.date.slice(0, 16));

            // Comercio normalizado, confianza por campo, cuotas y duplicados.
            if (data.merchant) setMerchant(data.merchant);
            if (data.confidence && typeof data.confidence === 'object') {
                setOcrConfidence(data.confidence);
            }
            if (data.installments && typeof data.installments === 'object') {
                setInstallments(data.installments);
            }
            if (data.duplicate) setIsDuplicate(true);
            if (data.duplicate_of) setDuplicateOf(data.duplicate_of);
            if (data.image_hash) setImageHash(data.image_hash);

            // Productos detectados: se muestran y se pueden corregir antes de guardar.
            if (Array.isArray(data.items)) {
                setItems(
                    data.items
                        .filter((item: any) => item && item.item_name)
                        .map((item: any) => ({
                            item_name: String(item.item_name),
                            quantity: normalizeQuantity(item.quantity, 1),
                            unit_price: roundMoney(Number(item.unit_price) || 0),
                            total_price: roundMoney(Number(item.total_price) || 0),
                            category: item.category ?? null,
                            category_id: item.category_id ?? null,
                            confidence: item.confidence ?? null,
                        }))
                );
            }
            
            if (data.category && categories.length > 0) {
                const lowerCat = data.category.toLowerCase();
                // Filter categories by the current (or new) type to avoid cross-type matching
                const filteredCats = categories.filter(c => 
                    (data.nature === 'Ingreso' && c.type === 'income') ||
                    (data.nature === 'Gasto' && c.type === 'expense') ||
                    (!data.nature) // fallback to all if nature is missing
                );

                const matchedCat = filteredCats.find(c => 
                    c.name.toLowerCase().includes(lowerCat) || 
                    lowerCat.includes(c.name.toLowerCase())
                );
                
                if (matchedCat) {
                    setCategoryId(matchedCat.id);
                }
            }
        } catch (error) {
            console.error('Error scanning receipt:', error);
        } finally {
            setIsScanning(false);
        }
    };

    /**
     * El usuario corrige la categoría de un producto → guardamos la regla aprendida
     * (comercio + producto → categoría) para las próximas facturas.
     * Best-effort: si falla, no molestamos al usuario.
     */
    const handleCategoryCorrected = async (item: OcrItem, categoryId: string) => {
        const categoryName = categories.find((c) => c.id === categoryId)?.name;
        const merchantKey = (merchant || description).trim();
        if (!categoryName || !merchantKey || !item.item_name) return;

        try {
            await createCategoryRule.mutateAsync({
                merchant: merchantKey,
                raw_keyword: item.item_name,
                category: categoryName,
            });
        } catch {
            // Silencioso a propósito: la regla es una mejora, no un requisito.
        }
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
        setItems([]);
        setMerchant('');
        setSource('manual');
        setOcrConfidence({});
        setIsDuplicate(false);
        setDuplicateOf(null);
        setInstallments(null);
        setImageHash(null);
    };

    const confidenceEntries = Object.entries(ocrConfidence).filter(
        ([, value]) => typeof value === 'number' && !Number.isNaN(value)
    );

    return (
        <Card variant="elevated" className="mt-8 border-indigo-500/5 overflow-hidden">
            <form action={createTransaction} className="space-y-10 p-2">
                {/* Hidden input to send the URL to the server action */}
                <input type="hidden" name="receipt_url" value={receiptUrl || ''} />
                {/* Hidden inputs: datos del OCR que ahora se persisten */}
                <input type="hidden" name="items" value={JSON.stringify(items)} />
                <input type="hidden" name="merchant" value={merchant} />
                <input type="hidden" name="source" value={source} />
                <input type="hidden" name="image_hash" value={imageHash || ''} />
                <input
                    type="hidden"
                    name="installments"
                    value={installments ? JSON.stringify(installments) : ''}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8">
                    {/* Receipt Upload (Moved to top) */}
                    <div className="md:col-span-2 bg-blue-50/50 dark:bg-blue-900/10 p-6 rounded-3xl border border-blue-500/10">
                        <label className="block text-sm font-bold text-foreground mb-4">
                            Toma una Foto o Sube tu Recibo (Imagen/PDF)
                        </label>

                        {!filePreview ? (
                            <div className="flex justify-center px-6 pt-5 pb-6 border-2 border-foreground/10 border-dashed rounded-2xl hover:border-blue-500/50 hover:bg-blue-500/5 transition-all group cursor-pointer relative bg-card">
                                <input
                                    type="file"
                                    accept="image/*,application/pdf"
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                    onChange={handleFileChange}
                                    disabled={uploading || isScanning}
                                />
                                <div className="space-y-2 text-center">
                                    <div className="mx-auto h-12 w-12 text-foreground/20 group-hover:text-blue-500 transition-colors flex items-center justify-center rounded-full bg-foreground/5 group-hover:bg-blue-500/10">
                                        {uploading || isScanning ? <Loader2 className="animate-spin" size={24} /> : <Paperclip size={24} />}
                                    </div>
                                    <div className="flex text-sm text-foreground/60 justify-center flex-wrap gap-1">
                                        <span className="relative cursor-pointer rounded-md font-bold text-blue-600 hover:text-blue-500">
                                            {isScanning ? 'Escaneando con IA...' : (uploading ? 'Subiendo...' : 'Toma foto o elige archivo')}
                                        </span>
                                    </div>
                                    <p className="text-xs text-foreground/40 mt-1">
                                        Fotos de tickets o facturas PDF hasta 5MB.<br/>¡La IA llenará todo por ti!
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="relative rounded-2xl border border-foreground/10 bg-card p-4 flex items-center justify-between shadow-sm">
                                <div className="flex items-center space-x-4 w-full overflow-hidden">
                                    <div className="h-16 w-16 flex-shrink-0 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center overflow-hidden border border-foreground/5">
                                        {receiptFile?.type.startsWith('image/') ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={filePreview} alt="Preview" className="h-full w-full object-cover" />
                                        ) : (
                                            <Paperclip className="text-blue-500" size={24} />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0 pr-4">
                                        <Typography variant="body" className="font-bold text-foreground text-sm truncate">
                                            {receiptFile?.name}
                                        </Typography>
                                        <Typography variant="small" className="text-blue-600 font-bold text-[10px] uppercase flex items-center mt-1">
                                            {isScanning ? (
                                                <><Loader2 size={10} className="mr-1 animate-spin" /> Analizando recibo con IA...</>
                                            ) : uploading ? (
                                                <><Loader2 size={10} className="mr-1 animate-spin" /> Subiendo respaldo...</>
                                            ) : (
                                                <span className="text-green-600">Comprobante guardado</span>
                                            )}
                                        </Typography>
                                    </div>
                                </div>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={clearReceipt}
                                    className="text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 shrink-0"
                                >
                                    <Trash2 size={18} />
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Resumen del OCR: comercio, cuotas, confianza y productos */}
                    {(items.length > 0 || merchant || installments || isDuplicate) && (
                        <div className="md:col-span-2 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                            <div className="rounded-2xl border border-foreground/[0.06] bg-foreground/[0.02] p-4 sm:p-5">
                                <div className="flex flex-wrap items-center justify-between gap-4">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="h-11 w-11 shrink-0 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600">
                                            <Store size={20} />
                                        </div>
                                        <div className="min-w-0">
                                            <Typography variant="small" className="text-muted-foreground">
                                                Comercio detectado
                                            </Typography>
                                            <Typography variant="body" className="font-black text-foreground truncate">
                                                {merchant || description}
                                            </Typography>
                                        </div>
                                    </div>

                                    {installments && (
                                        <div className="rounded-xl border border-amber-100 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-900/20 px-3 py-2">
                                            <Typography variant="small" className="text-amber-700 dark:text-amber-300">
                                                Cuota {installments.current} de {installments.total}
                                            </Typography>
                                            <Typography variant="body" className="font-black text-amber-800 dark:text-amber-200">
                                                Total de la compra: {formatCurrency(installments.purchase_total_amount ?? 0)}
                                            </Typography>
                                        </div>
                                    )}
                                </div>

                                {confidenceEntries.length > 0 && (
                                    <div className="mt-4 flex flex-wrap items-center gap-2">
                                        <Typography variant="small" className="text-muted-foreground">
                                            Confianza
                                        </Typography>
                                        {confidenceEntries.map(([field, value]) => {
                                            const low = value < 0.6;
                                            return (
                                                <span
                                                    key={field}
                                                    className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                                                        low
                                                            ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-500/20 text-amber-700 dark:text-amber-300'
                                                            : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                                                    }`}
                                                >
                                                    {CONFIDENCE_LABELS[field] || field}: {Math.round(value * 100)}%
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {isDuplicate && (
                                <div className="rounded-2xl border border-amber-500/20 bg-amber-50 dark:bg-amber-900/10 p-4 flex items-start gap-3">
                                    <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                                    <div>
                                        <Typography variant="body" className="font-bold text-amber-800 dark:text-amber-200">
                                            Posible factura duplicada
                                        </Typography>
                                        <Typography variant="muted" className="text-amber-700/80 dark:text-amber-300/70">
                                            {duplicateOf
                                                ? `Coincide con el movimiento ${duplicateOf}. Revisa antes de guardar para no contarla dos veces.`
                                                : 'Ya existe una factura muy similar registrada. Revisa antes de guardar para no contarla dos veces.'}
                                        </Typography>
                                    </div>
                                </div>
                            )}

                            <OcrItemsEditor
                                items={items}
                                categories={categories}
                                onChange={setItems}
                                onCategoryCorrected={handleCategoryCorrected}
                            />
                        </div>
                    )}

                    {/* Amount */}
                    <div className="md:col-span-1">
                        <InputField
                            label="Monto total"
                            name="amount"
                            type="text"
                            placeholder="0"
                            required
                            value={amount}
                            onChange={handleAmountChange}
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
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
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
                            value={categoryId}
                            onChange={(e) => setCategoryId(e.target.value)}
                        >
                            <option value="">Selecciona categoría</option>
                            <optgroup label="Gastos Comunes">
                                {expenseCategories.map((c: Category) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </optgroup>
                            <optgroup label="Fuentes de Ingreso">
                                {incomeCategories.map((c: Category) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </optgroup>
                        </InputField>
                    </div>



                    {/* Date with Time */}
                    <div className="md:col-span-2">
                        <InputField
                            label="Fecha y Hora"
                            name="date"
                            type="datetime-local"
                            required
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
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
