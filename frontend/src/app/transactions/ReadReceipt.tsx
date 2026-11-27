'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import OcrItemsEditor, { type OcrCategory, type OcrItem } from '@/components/ui/molecules/OcrItemsEditor';
import { Button } from '@/components/ui/atoms/Button';
import { fetchWithAuth } from '@/lib/api/client';
import { ocrApi } from '@/lib/api/ocr.api';

const maxBytes = 9 * 1024 * 1024;

async function readStoredReceipt(receiptUrl: string) {
    const url = new URL(receiptUrl);
    if (url.origin !== new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin ||
        !url.pathname.startsWith('/storage/v1/object/public/receipts/')) {
        throw new Error('El enlace no apunta al almacén de comprobantes de NiddoFlow.');
    }
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('No se pudo abrir el comprobante guardado.');
    if (Number(response.headers.get('content-length')) > maxBytes) throw new Error('El comprobante supera el límite de 9 MB.');
    const blob = await response.blob();
    if (blob.size > maxBytes) throw new Error('El comprobante supera el límite de 9 MB.');

    const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    const signature = String.fromCharCode(...bytes);
    let type = blob.type;
    if (signature.startsWith('%PDF-')) type = 'application/pdf';
    else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) type = 'image/jpeg';
    else if (signature.startsWith('\x89PNG\r\n\x1a\n')) type = 'image/png';
    else if (signature.startsWith('RIFF') && signature.slice(8) === 'WEBP') type = 'image/webp';
    if (!type.startsWith('image/') && type !== 'application/pdf') {
        throw new Error('El formato del comprobante guardado no es compatible.');
    }
    return ocrApi.extract(new File([blob], 'comprobante', { type }), true);
}

export function ReadReceipt({ transactionId, receiptUrl, categories }: {
    transactionId: string;
    receiptUrl: string;
    categories: OcrCategory[];
}) {
    const queryClient = useQueryClient();
    const [items, setItems] = useState<OcrItem[]>([]);
    const [status, setStatus] = useState('');
    const read = useMutation({
        mutationFn: () => readStoredReceipt(receiptUrl),
        onSuccess: result => {
            setItems(result.items ?? []);
            setStatus(result.items?.length ? 'Revisa los productos antes de guardarlos en este movimiento.' : 'El OCR no encontró líneas de productos en este comprobante.');
        },
        onError: error => {
            if (error.message === 'OCR_RECOVERY_QUOTA') setStatus('El lector alcanzó su cuota. Intenta más tarde.');
            else if (error.message === 'OCR_RECOVERY_BUSY') setStatus('Hay otro comprobante en lectura. Intenta en un momento.');
            else setStatus(error.message || 'No se pudo leer el comprobante.');
        },
    });
    const save = useMutation({
        mutationFn: () => fetchWithAuth('/transactions/' + transactionId + '/recover-items', {
            method: 'POST',
            body: JSON.stringify({ receipt_url: receiptUrl, items }),
        }),
        onSuccess: async result => {
            setItems([]);
            setStatus(result.saved ? 'Productos añadidos.' : 'El movimiento ya tenía productos.');
            await queryClient.invalidateQueries({ queryKey: ['transactions'] });
        },
        onError: error => setStatus(error.message || 'No se pudieron guardar los productos.'),
    });

    return (
        <div className="space-y-3">
            {!items.length && (
                <Button type="button" size="sm" variant="outline" disabled={read.isPending || save.isPending}
                    onClick={() => { setStatus(''); read.mutate(); }}>
                    {read.isPending ? 'Leyendo comprobante…' : 'Volver a leer comprobante'}
                </Button>
            )}
            {status && <p role="status" className="text-sm text-muted-foreground">{status}</p>}
            {items.length > 0 && (
                <>
                    <OcrItemsEditor items={items} categories={categories} onChange={setItems} />
                    <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" disabled={save.isPending} onClick={() => save.mutate()}>Guardar productos</Button>
                        <Button type="button" size="sm" variant="ghost" disabled={save.isPending}
                            onClick={() => { setItems([]); setStatus(''); }}>Descartar lectura</Button>
                    </div>
                </>
            )}
        </div>
    );
}
