'use client';

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import OcrItemsEditor, { type OcrCategory, type OcrItem } from '@/components/ui/molecules/OcrItemsEditor';
import { fetchWithAuth } from '@/lib/api/client';
import { ocrApi } from '@/lib/api/ocr.api';
import { formatCurrency } from '@/utils/format';

type Receipt = { id: string; description: string; receipt_url: string; amount: number };

function receiptAddress(value: string) {
    const url = new URL(value);
    if (url.origin !== new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin ||
        !url.pathname.startsWith('/storage/v1/object/public/receipts/')) {
        throw new Error('El adjunto no pertenece al almacén de recibos.');
    }
    return url.href;
}

async function receiptMime(blob: Blob) {
    const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    const signature = String.fromCharCode(...bytes);
    if (signature.startsWith('%PDF-')) return 'application/pdf';
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
    if (signature.startsWith('\x89PNG\r\n\x1a\n')) return 'image/png';
    if (signature.startsWith('RIFF') && signature.slice(8) === 'WEBP') return 'image/webp';
    if (blob.type.startsWith('image/')) return blob.type;
    throw new Error('Formato no reconocido. Vuelve a adjuntar el recibo como JPG, PNG, WebP o PDF.');
}

export function ReceiptRecovery({ receipts, categories }: { receipts: Receipt[]; categories: OcrCategory[] }) {
    const client = useQueryClient();
    const attempted = useRef(new Set<string>());
    const busy = useRef(false);
    const [running, setRunning] = useState(false);
    const [saving, setSaving] = useState<string | null>(null);
    const [message, setMessage] = useState('');
    const [issues, setIssues] = useState<string[]>([]);
    const [drafts, setDrafts] = useState<{ receipt: Receipt; items: OcrItem[] }[]>([]);
    const pending = receipts.filter(receipt => !attempted.current.has(receipt.id));

    async function scan() {
        if (busy.current || drafts.length) return;
        const cooldown = Number(sessionStorage.getItem('niddo-receipt-recovery-cooldown') ?? 0);
        if (Date.now() < cooldown) {
            setMessage('La cuota está pausada. Puedes volver a intentar en ' + Math.ceil((cooldown - Date.now()) / 60000) + ' min.');
            return;
        }
        busy.current = true;
        setRunning(true);
        let complete = 0;
        let skipped = 0;
        let quota = false;
        let concurrent = false;
        const batchIssues: string[] = [];
        try {
            for (const receipt of pending.slice(0, 3)) {
                setMessage('Leyendo «' + receipt.description + '»…');
                try {
                    const response = await fetch(receiptAddress(receipt.receipt_url), {
                        redirect: 'error', signal: AbortSignal.timeout(20000),
                    });
                    if (!response.ok) throw new Error('El adjunto no se pudo descargar.');
                    if (Number(response.headers.get('content-length')) > 10 * 1024 * 1024) throw new Error('El adjunto supera los 10 MB.');
                    const blob = await response.blob();
                    if (blob.size > 10 * 1024 * 1024) throw new Error('El adjunto supera los 10 MB.');
                    const result = await ocrApi.extract(new File([blob], 'recibo', { type: await receiptMime(blob) }), true);
                    if (result.items?.length) {
                        const items = result.items;
                        setDrafts(previous => [...previous, { receipt, items }]);
                        complete++;
                    } else {
                        skipped++;
                        batchIssues.push(receipt.description + ' · El lector no detectó productos.');
                    }
                } catch (error) {
                    if (error instanceof Error && error.message === 'OCR_RECOVERY_BUSY') {
                        concurrent = true;
                        break;
                    }
                    if (error instanceof Error && error.message === 'OCR_RECOVERY_QUOTA') {
                        sessionStorage.setItem('niddo-receipt-recovery-cooldown', String(Date.now() + 900000));
                        quota = true;
                        break;
                    }
                    skipped++;
                    batchIssues.push(receipt.description + ' · ' + (
                        error instanceof Error && (error.message.startsWith('El adjunto') || error.message.startsWith('Formato no reconocido'))
                            ? error.message : 'No se pudo leer el adjunto.'
                    ));
                }
                attempted.current.add(receipt.id);
            }
            setIssues(batchIssues);
            setMessage(`${complete} para revisar · ${skipped} sin productos legibles o con adjunto inaccesible.${quota ? ' Cuota del OCR agotada. Puedes intentar de nuevo en 15 min.' : ''}${concurrent ? ' Ya hay otra recuperación en curso. Intenta de nuevo en un momento.' : ''}`);
        } finally {
            setRunning(false);
            busy.current = false;
        }
    }

    async function save(receipt: Receipt, items: OcrItem[]) {
        if (busy.current || !items.length) return;
        busy.current = true;
        setSaving(receipt.id);
        try {
            const result = await fetchWithAuth('/transactions/' + receipt.id + '/recover-items', {
                method: 'POST',
                body: JSON.stringify({ receipt_url: receipt.receipt_url, items }),
            });
            setDrafts(previous => previous.filter(draft => draft.receipt.id !== receipt.id));
            setMessage(result.saved ? 'Productos guardados en el movimiento original.' : 'El movimiento ya tenía productos.');
            await client.invalidateQueries({ queryKey: ['transactions'] });
        } catch {
            setMessage('No se pudieron guardar los productos. Puedes volver a intentar.');
        } finally {
            busy.current = false;
            setSaving(null);
        }
    }

    if (!receipts.length && !drafts.length && !message) return null;
    return (
        <details className="rounded-2xl border border-foreground/10 bg-card p-4">
            <summary className="cursor-pointer font-bold">Recuperar productos de facturas anteriores</summary>
            <p className="my-3 text-sm text-muted-foreground">Lee hasta 3 adjuntos por lote. Revisa los productos antes de guardarlos.</p>
            <button type="button" onClick={scan} disabled={running || !!saving || !pending.length || !!drafts.length}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">
                {running ? 'Leyendo facturas…' : `Procesar hasta 3 · ${pending.length} pendientes`}
            </button>
            {message && <p role="status" className="mt-3 text-sm">{message}</p>}
            {issues.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {issues.map((issue, index) => <li key={index}>{issue}</li>)}
            </ul>}
            {drafts.map(({ receipt, items }) => (
                <div key={receipt.id} className="mt-4 space-y-3 rounded-xl border border-foreground/10 p-3">
                    <h3 className="font-bold">{receipt.description} · {formatCurrency(receipt.amount)}</h3>
                    <OcrItemsEditor items={items} categories={categories} onChange={next => setDrafts(previous =>
                        previous.map(draft => draft.receipt.id === receipt.id ? { ...draft, items: next } : draft)
                    )} />
                    <div className="flex flex-wrap gap-3">
                        <button type="button" disabled={running || !!saving || !items.length} onClick={() => save(receipt, items)}
                            className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">
                            Guardar productos
                        </button>
                        <button type="button" disabled={!!saving} onClick={() => setDrafts(previous => previous.filter(draft => draft.receipt.id !== receipt.id))}
                            className="px-3 text-sm font-semibold">Omitir</button>
                    </div>
                </div>
            ))}
        </details>
    );
}
