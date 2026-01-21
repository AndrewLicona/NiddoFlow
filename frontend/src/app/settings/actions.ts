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

export async function leaveFamily() {
    const headers = await getAuthHeader()
    if (!headers) redirect('/login')

    const res = await fetch(`${API_URL}/families/leave`, {
        method: 'POST',
        headers,
    })

    if (!res.ok) {
        throw new Error('Failed to leave family')
    }

    revalidatePath('/')
    // We do NOT redirect here because redirect throws an error that is caught as a failure in the client component.
    // Instead we return success and let the client redirect.
    return { success: true }
}
