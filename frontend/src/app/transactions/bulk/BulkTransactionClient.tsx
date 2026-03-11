'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Card } from '@/components/ui/molecules/Card';
import { Typography } from '@/components/ui/atoms/Typography';
import { Button } from '@/components/ui/atoms/Button';
import { InputField } from '@/components/ui/molecules/InputField';
import { createBulkTransactions } from '../actions';
import { 
    Upload, 
    FileText, 
    Trash2, 
    CheckCircle2, 
    AlertCircle, 
    Loader2, 
    Plus, 
    Save, 
    FileArchive,
    ArrowLeft
} from 'lucide-react';
import Link from 'next/link';
import { formatCurrency } from '@/utils/format';
import { createClient } from '@/utils/supabase/client';

interface Category {
    id: string;
    name: string;
    type: 'income' | 'expense' | 'transfer';
}

interface Account {
    id: string;
    name: string;
    balance: number;
}

interface OCRResult {
    id_temp: string;
    amount: number | null;
    date: string | null;
    description: string | null;
    category: string | null;
    nature: string | null;
    status: 'pending' | 'processing' | 'success' | 'error';
    account_id: string;
    category_id: string;
}

interface Props {
    categories: Category[];
    accounts: Account[];
}

export default function BulkTransactionClient({ categories: initialCategories, accounts: initialAccounts }: Props) {
    const [results, setResults] = useState<OCRResult[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [categories, setCategories] = useState<Category[]>(initialCategories);
    const [accounts, setAccounts] = useState<Account[]>(initialAccounts);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Ensure we have accounts/categories if server fetch failed
    useEffect(() => {
        const fetchMetadata = async () => {
            if (categories.length > 0 && accounts.length > 0) return;
            
            try {
                const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
                const supabase = createClient();
                const { data: { session } } = await supabase.auth.getSession();
                const headers: Record<string, string> = {};
                if (session) headers['Authorization'] = `Bearer ${session.access_token}`;

                if (categories.length === 0) {
                    const resCat = await fetch(`${baseUrl}/categories/`, { headers });
                    if (resCat.ok) setCategories(await resCat.json());
                }
                
                if (accounts.length === 0) {
                    const resAcc = await fetch(`${baseUrl}/accounts/?scope=family`, { headers });
                    if (resAcc.ok) setAccounts(await resAcc.json());
                }
            } catch (err) {
                console.error("Error refreshing metadata:", err);
            }
        };
        fetchMetadata();
    }, []);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setIsProcessing(true);
        const formData = new FormData();
        Array.from(files).forEach(file => {
            formData.append('files', file);
        });

        try {
            const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            
            const headers: Record<string, string> = {};
            if (session) headers['Authorization'] = `Bearer ${session.access_token}`;

            const response = await fetch(`${baseUrl}/api/ocr/extract-bulk`, {
                method: 'POST',
                headers,
                body: formData,
            });

            if (!response.ok) throw new Error('Bulk OCR failed');

            const data = await response.json();
            
            // Map results and try to match categories
            const mappedResults: OCRResult[] = data.map((res: any, index: number) => {
                const nature = res.nature || 'Gasto';
                const type = nature === 'Ingreso' ? 'income' : 'expense';
                
                // Match category
                let matchedId = '';
                if (res.category) {
                    const found = categories.find(c => 
                        c.type === type && 
                        (c.name.toLowerCase().includes(res.category.toLowerCase()) || 
                         res.category.toLowerCase().includes(c.name.toLowerCase()))
                    );
                    if (found) matchedId = found.id;
                }

                return {
                    id_temp: `temp_${Date.now()}_${index}`,
                    amount: res.amount,
                    date: res.date ? res.date.slice(0, 16) : new Date().toISOString().slice(0, 16),
                    description: res.description,
                    category: res.category,
                    nature: nature,
                    status: 'success',
                    account_id: accounts[0]?.id || '',
                    category_id: matchedId
                };
            });

            setResults(prev => [...prev, ...mappedResults]);
        } catch (error) {
            console.error('Error in bulk processing:', error);
            alert('Error al procesar los archivos. Inténtalo de nuevo.');
        } finally {
            setIsProcessing(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const updateResult = (id: string, field: keyof OCRResult, value: any) => {
        setResults(prev => prev.map(r => r.id_temp === id ? { ...r, [field]: value } : r));
    };

    const formatInputValue = (val: number | null) => {
        if (val === null || isNaN(val)) return '';
        return new Intl.NumberFormat('es-CO').format(val);
    };

    const parseInputValue = (val: string) => {
        const cleanValue = val.replace(/\./g, '');
        const parsed = parseFloat(cleanValue);
        return isNaN(parsed) ? 0 : parsed;
    };

    const removeResult = (id: string) => {
        setResults(prev => prev.filter(r => r.id_temp !== id));
    };

    const handleSaveAll = async () => {
        if (results.length === 0) return;
        
        // Validate
        const missingAccount = results.find(r => !r.account_id);
        if (missingAccount) {
            alert('Todas las transacciones deben tener una cuenta seleccionada.');
            return;
        }

        setIsSaving(true);
        try {
            const payload = results.map(r => ({
                description: r.description || 'Transacción Masiva',
                amount: r.amount || 0,
                type: r.nature === 'Ingreso' ? 'income' : (r.nature === 'Transferencia' ? 'transfer' : 'expense'),
                category_id: r.category_id || null,
                account_id: r.account_id,
                date: r.date,
                receipt_url: null
            }));

            await createBulkTransactions(payload as any);
            setShowSuccess(true);
            setResults([]);
        } catch (error) {
            console.error('Error saving bulk transactions:', error);
            alert('Error al guardar las transacciones.');
        } finally {
            setIsSaving(false);
        }
    };

    if (showSuccess) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-in zoom-in duration-500">
                <div className="h-24 w-24 rounded-full bg-green-500/10 flex items-center justify-center text-green-600 mb-8 shadow-2xl shadow-green-500/20">
                    <CheckCircle2 size={48} className="animate-bounce" />
                </div>
                <Typography variant="h2" className="font-black text-4xl mb-4">¡Todo guardado con éxito!</Typography>
                <Typography variant="body" className="text-foreground/60 max-w-md mb-10">
                    Tus transacciones han sido procesadas y registradas correctamente en NiddoFlow.
                </Typography>
                <div className="flex gap-4">
                    <Link href="/transactions">
                        <Button variant="primary" className="h-14 px-8 text-lg rounded-2xl shadow-xl shadow-blue-500/20">
                            Ver historial
                        </Button>
                    </Link>
                    <Button variant="ghost" className="h-14 px-8 text-lg rounded-2xl" onClick={() => setShowSuccess(false)}>
                        Cargar más
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <Link href="/transactions" className="flex items-center text-sm text-foreground/40 hover:text-blue-500 mb-2 transition-colors">
                        <ArrowLeft size={16} className="mr-1" /> Volver
                    </Link>
                    <Typography variant="h2" className="font-black tracking-tight text-3xl md:text-4xl">
                        Carga Masiva <span className="text-blue-600">IA</span>
                    </Typography>
                    <Typography variant="body" className="text-sm md:text-base text-foreground/60 mt-1 md:mt-2">
                        Sube tus facturas (fotos, PDFs o ZIP) y deja que la IA haga el trabajo.
                    </Typography>
                </div>
            </div>

            {/* Dropzone */}
            <Card variant="elevated" className="border-dashed border-2 border-blue-500/20 bg-blue-50/5 dark:bg-blue-900/5 p-6 md:p-10">
                <div className="flex flex-col items-center text-center">
                    <div className="h-16 w-16 md:h-20 md:w-20 rounded-2xl md:rounded-3xl bg-blue-500/10 flex items-center justify-center text-blue-600 mb-4 md:mb-6">
                        {isProcessing ? <Loader2 className="animate-spin" size={32} /> : <Upload size={32} />}
                    </div>
                    <Typography variant="h3" className="text-xl md:text-2xl font-bold mb-2">
                        {isProcessing ? 'Procesando con IA...' : 'Arrastra tus facturas'}
                    </Typography>
                    <Typography variant="body" className="text-xs md:text-sm text-foreground/40 mb-6 md:mb-8 max-w-sm">
                        JPG, PNG, PDF y ZIP. Extraemos monto, fecha y tipo automáticamente.
                    </Typography>
                    
                    <input 
                        type="file" 
                        multiple 
                        accept="image/*,application/pdf,application/zip" 
                        className="hidden" 
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        disabled={isProcessing}
                    />
                    
                    <Button 
                        variant="primary" 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isProcessing}
                        className="w-full md:w-auto px-10 h-12 md:h-14 text-base md:text-lg shadow-xl shadow-blue-500/20"
                    >
                        {isProcessing ? 'Analizando...' : 'Seleccionar Archivos'}
                    </Button>
                </div>
            </Card>

            {/* Results Table */}
            {results.length > 0 && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-card p-4 rounded-2xl border border-foreground/5 shadow-sm sticky top-20 z-10">
                        <div className="flex items-center gap-3 w-full md:w-auto">
                            <div className="h-10 w-10 rounded-xl bg-green-500/10 flex items-center justify-center text-green-600 flex-shrink-0">
                                <CheckCircle2 size={24} />
                            </div>
                            <div>
                                <Typography variant="body" className="font-bold text-sm md:text-base">Listas para guardar</Typography>
                                <Typography variant="small" className="text-foreground/40 text-xs">{results.length} transacciones detectadas</Typography>
                            </div>
                        </div>
                        <Button 
                            variant="primary" 
                            onClick={handleSaveAll}
                            disabled={isSaving}
                            className="w-full md:w-auto bg-green-600 hover:bg-green-700 shadow-lg shadow-green-500/10"
                        >
                            {isSaving ? <Loader2 className="animate-spin mr-2" size={18} /> : <Save size={18} className="mr-2" />}
                            Guardar {results.length === 1 ? 'Factura' : 'Todas'}
                        </Button>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        {results.map((res) => (
                            <Card key={res.id_temp} className="p-0 overflow-hidden border-foreground/5 hover:border-blue-500/30 transition-all group">
                                <div className="p-4 md:p-5 grid grid-cols-2 md:grid-cols-12 gap-4 md:gap-6 items-start md:items-end">
                                    <div className="col-span-2 md:col-span-2">
                                        <Typography variant="small" className="font-bold uppercase tracking-widest text-[10px] text-foreground/30 mb-1 block">Descripción</Typography>
                                        <input 
                                            value={res.description || ''} 
                                            onChange={(e) => updateResult(res.id_temp, 'description', e.target.value)}
                                            placeholder="Concepto..."
                                            className="w-full bg-transparent border-none p-0 focus:ring-0 font-bold text-sm text-foreground/90 placeholder-foreground/20"
                                        />
                                    </div>
                                    <div className="col-span-1 md:col-span-2">
                                        <Typography variant="small" className="font-bold uppercase tracking-widest text-[10px] text-foreground/30 mb-1 block">Monto</Typography>
                                        <div className="relative group">
                                            <span className="absolute left-0 top-1/2 -translate-y-1/2 text-blue-500 font-bold text-lg opacity-50">$</span>
                                            <input 
                                                type="text"
                                                value={formatInputValue(res.amount)} 
                                                onChange={(e) => updateResult(res.id_temp, 'amount', parseInputValue(e.target.value))}
                                                className="w-full bg-transparent border-none pl-4 p-0 focus:ring-0 font-black text-xl text-blue-600 dark:text-blue-400"
                                            />
                                        </div>
                                    </div>
                                    <div className="col-span-1 md:col-span-1">
                                        <Typography variant="small" className="font-bold uppercase tracking-widest text-[10px] text-foreground/30 mb-1 block">Tipo</Typography>
                                        <select 
                                            value={res.nature || 'Gasto'} 
                                            onChange={(e) => updateResult(res.id_temp, 'nature', e.target.value)}
                                            className="w-full bg-zinc-100 dark:bg-zinc-900/50 border-2 border-zinc-200 dark:border-white/10 rounded-xl px-2 py-2 focus:ring-2 focus:ring-blue-500 text-[11px] font-bold text-foreground/80 dark:text-foreground/90 appearance-none shadow-sm transition-all hover:bg-white dark:hover:bg-zinc-900"
                                        >
                                            <option value="Gasto">Gasto</option>
                                            <option value="Ingreso">Ingreso</option>
                                            <option value="Transferencia">Trans.</option>
                                        </select>
                                    </div>
                                    <div className="col-span-1 md:col-span-2">
                                        <Typography variant="small" className="font-bold uppercase tracking-widest text-[10px] text-foreground/30 mb-1 block">Fecha</Typography>
                                        <input 
                                            type="date" 
                                            value={res.date ? res.date.split('T')[0] : ''} 
                                            onChange={(e) => updateResult(res.id_temp, 'date', e.target.value)}
                                            className="w-full bg-zinc-100 dark:bg-zinc-900/50 border-2 border-zinc-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm text-foreground/60 dark:text-foreground/80 focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    <div className="col-span-1 md:col-span-2">
                                        <Typography variant="small" className="font-bold uppercase tracking-widest text-[10px] text-foreground/30 mb-1 block">Cuenta</Typography>
                                        <select 
                                            value={res.account_id} 
                                            onChange={(e) => updateResult(res.id_temp, 'account_id', e.target.value)}
                                            className="w-full bg-zinc-100 dark:bg-zinc-900/50 border-2 border-zinc-200 dark:border-white/10 rounded-xl px-3 py-2 focus:ring-2 focus:ring-blue-500 text-sm font-bold text-foreground/80 dark:text-foreground/90 appearance-none shadow-sm transition-all hover:bg-white dark:hover:bg-zinc-900"
                                        >
                                            <option value="">Seleccionar...</option>
                                            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="col-span-1 md:col-span-2">
                                        <Typography variant="small" className="font-bold uppercase tracking-widest text-[10px] text-foreground/30 mb-1 block">Categoría</Typography>
                                        <select 
                                            value={res.category_id} 
                                            onChange={(e) => updateResult(res.id_temp, 'category_id', e.target.value)}
                                            className="w-full bg-zinc-100 dark:bg-zinc-900/50 border-2 border-zinc-200 dark:border-white/10 rounded-xl px-3 py-2 focus:ring-2 focus:ring-blue-500 text-sm font-bold text-foreground/80 dark:text-foreground/90 appearance-none shadow-sm transition-all hover:bg-white dark:hover:bg-zinc-900"
                                        >
                                            <option value="">Categoría...</option>
                                            {categories
                                                .filter(c => c.type === (res.nature === 'Ingreso' ? 'income' : 'expense'))
                                                .map(c => <option key={c.id} value={c.id}>{c.name}</option>)
                                            }
                                        </select>
                                    </div>
                                    <div className="col-span-1 md:col-span-1 flex justify-end">
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            onClick={() => removeResult(res.id_temp)}
                                            className="text-rose-500 hover:bg-rose-500/10 p-2"
                                        >
                                            <Trash2 size={18} />
                                        </Button>
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
