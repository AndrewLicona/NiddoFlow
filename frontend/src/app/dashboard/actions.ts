'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function completeOnboarding() {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) return

    await supabase
        .from('profiles')
        .update({ onboarding_completed: true })
        .eq('id', session.user.id)

    revalidatePath('/')
}
