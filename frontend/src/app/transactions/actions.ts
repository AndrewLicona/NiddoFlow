'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'

async function getAuthHeader() {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return null
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
    }
}

export async function createTransaction(formData: FormData) {
    const headers = await getAuthHeader()
    if (!headers) redirect('/login')

    const rawData = {
        description: formData.get('description'),
        amount: Number(formData.get('amount')),
        type: formData.get('type'),
        category_id: formData.get('categoryId') || null,
        account_id: formData.get('accountId'),
        date: formData.get('date'), // "YYYY-MM-DD"
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

    revalidatePath('/transactions')
    revalidatePath('/') // Update dashboard balance presumably
    redirect('/transactions')
}
