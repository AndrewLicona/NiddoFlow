'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createFamily(formData: FormData) {
    const familyName = formData.get('familyName') as string
    const supabase = await createClient()

    // Get current session for token
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
        redirect('/login')
    }

    // Call FastAPI
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'}/families/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ name: familyName })
    })

    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        console.error("Failed to create family", errorData)
        // Handle error (could redirect back with error param)
        throw new Error('Failed to create family')
    }

    revalidatePath('/', 'layout')
    redirect('/')
}
