'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'

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

export async function createAccount(formData: FormData) {
    const headers = await getAuthHeader()
    if (!headers) redirect('/login')

    const rawData = {
        name: formData.get('name'),
        type: formData.get('type'),
        balance: Number(formData.get('balance')),
    }

    const res = await fetch(`${API_URL}/accounts/`, {
        method: 'POST',
        headers,
        body: JSON.stringify(rawData)
    })

    if (!res.ok) {
        console.error('Failed to create account')
        throw new Error('Failed to create account')
    }

    revalidatePath('/', 'layout')
    redirect('/transactions/new')
}
