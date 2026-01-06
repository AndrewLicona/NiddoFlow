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

export async function joinFamily(formData: FormData) {
    const headers = await getAuthHeader()
    if (!headers) redirect('/login')

    const inviteCode = formData.get('inviteCode')

    const res = await fetch(`${API_URL}/families/join`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ invite_code: inviteCode })
    })

    if (!res.ok) {
        // Handle error better in a real app (e.g. return details to form)
        console.error('Failed to join family')
        // In server actions, throwing error shows error boundary or simple crash in dev
        // For better UX we should return state, but for MVP throw is acceptable to stop flow.
        throw new Error('Invalid code or error joining family')
    }

    revalidatePath('/')
    redirect('/')
}
