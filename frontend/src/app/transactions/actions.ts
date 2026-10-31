'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

const API_URL = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://backend:8000'

async function getAuthHeader() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return null
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
    }
}

/** Lee un campo del FormData que viaja como JSON (productos, cuotas...). */
function parseJsonField<T>(value: FormDataEntryValue | null): T | null {
    if (typeof value !== 'string' || !value.trim()) return null
    try {
        return JSON.parse(value) as T
    } catch {
        return null
    }
}

/** Normaliza los productos detectados por el OCR al payload que espera el backend. */
function normalizeItems(raw: unknown): TransactionItem[] {
    if (!Array.isArray(raw)) return []

    return raw
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map((item) => ({
            item_name: String(item.item_name ?? '').trim(),
            quantity: Number(item.quantity) || 1,
            unit_price: Number(item.unit_price) || 0,
            total_price: Number(item.total_price) || 0,
            category: (item.category as string | null) ?? null,
            category_id: (item.category_id as string | null) ?? null,
            confidence: item.confidence === undefined || item.confidence === null
                ? null
                : Number(item.confidence),
        }))
        .filter((item) => item.item_name.length > 0)
}

export async function createTransaction(formData: FormData) {
    const headers = await getAuthHeader()
    if (!headers) redirect('/login')

    const rawData = {
        description: formData.get('description'),
        amount: Number(formData.get('amount')?.toString().replace(/\./g, '') || 0),
        type: formData.get('type'),
        category_id: formData.get('categoryId') || null,
        account_id: formData.get('accountId'),
        date: formData.get('date'), // "YYYY-MM-DD"
        receipt_url: formData.get('receipt_url') || null,
        target_account_id: formData.get('targetAccountId') || null,
        // Datos del OCR: comercio, productos, cuotas y huella de la imagen.
        merchant: formData.get('merchant') || null,
        source: formData.get('source') || 'manual',
        image_hash: formData.get('image_hash') || null,
        installments: parseJsonField<TransactionInstallments>(formData.get('installments')),
        items: normalizeItems(parseJsonField<unknown>(formData.get('items'))),
    }

    // Append time to date to make it valid ISO if simple date.
    // Or let Backend handle T00:00:00. Pydantic expects datetime.
    // Let's ensure it sends a full ISO string if possible, or simple date string if Pydantic allows.
    // Better to send full ISO.
    if (rawData.date) {
        rawData.date = new Date(rawData.date as string).toISOString()
    } else {
        rawData.date = new Date().toISOString()
    }

    const res = await fetch(`${API_URL}/transactions/`, {
        method: 'POST',
        headers,
        body: JSON.stringify(rawData)
    })

    if (!res.ok) {
        console.error('Failed to create transaction', await res.text())
        throw new Error('Failed to create transaction')
    }

    // Optimized: Only revalidate the pages that need it most
    revalidatePath('/', 'layout')
    redirect('/transactions')
}
export async function deleteTransaction(transactionId: string) {
    const headers = await getAuthHeader()
    if (!headers) redirect('/login')

    const res = await fetch(`${API_URL}/transactions/${transactionId}`, {
        method: 'DELETE',
        headers
    })

    if (!res.ok) {
        console.error('Failed to delete transaction', await res.text())
        throw new Error('Failed to delete transaction')
    }

    revalidatePath('/transactions')
    revalidatePath('/')
}

interface TransactionItem {
    item_name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    category: string | null;
    category_id: string | null;
    confidence: number | null;
}

interface TransactionInstallments {
    current: number;
    total: number;
    purchase_total_amount: number;
}

interface TransactionUpdate {
    description?: string;
    amount?: number;
    type?: 'income' | 'expense' | 'transfer';
    category_id?: string | null;
    account_id?: string;
    date?: string;
    receipt_url?: string | null;
    target_account_id?: string | null;
    merchant?: string | null;
    source?: 'manual' | 'ocr' | 'import';
    image_hash?: string | null;
    installments?: TransactionInstallments | null;
    items?: TransactionItem[];
}

export async function updateTransaction(transactionId: string, data: TransactionUpdate) {
    const headers = await getAuthHeader()
    if (!headers) redirect('/login')

    // Format date if present
    if (data.date) {
        data.date = new Date(data.date).toISOString()
    }

    const res = await fetch(`${API_URL}/transactions/${transactionId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(data)
    })

    if (!res.ok) {
        console.error('Failed to update transaction', await res.text())
        throw new Error('Failed to update transaction')
    }

    revalidatePath('/transactions')
    revalidatePath('/')
}
export async function createBulkTransactions(transactions: TransactionUpdate[]) {
    const headers = await getAuthHeader()
    if (!headers) redirect('/login')

    // Process all transactions
    const processed = transactions.map(t => ({
        ...t,
        amount: Number(t.amount || 0),
        date: t.date ? new Date(t.date).toISOString() : new Date().toISOString(),
        // Los productos del OCR viajan con el mismo formato que en la carga simple.
        items: t.items ? normalizeItems(t.items) : [],
    }))

    const res = await fetch(`${API_URL}/transactions/bulk`, {
        method: 'POST',
        headers,
        body: JSON.stringify(processed)
    })

    if (!res.ok) {
        console.error('Failed to create bulk transactions', await res.text())
        throw new Error('Failed to create bulk transactions')
    }

    revalidatePath('/', 'layout')
    revalidatePath('/transactions')
    return { success: true }
}
