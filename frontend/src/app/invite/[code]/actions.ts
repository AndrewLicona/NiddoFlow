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

export async function joinFamilyByCode(inviteCode: string) {
    const headers = await getAuthHeader()
    if (!headers) redirect('/login')

    const res = await fetch(`${API_URL}/families/join`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ invite_code: inviteCode })
    })

    if (!res.ok) {
        throw new Error('Failed to join family')
    }

    revalidatePath('/')
    redirect('/')
}
