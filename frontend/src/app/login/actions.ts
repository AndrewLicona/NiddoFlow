'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/utils/supabase/server'

export async function login(formData: FormData) {
    const supabase = await createClient()
    const email = formData.get('email') as string
    const password = formData.get('password') as string

    const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
    })

    if (error) {
        redirect(`/login?error=${encodeURIComponent(error.message)}`)
    }

    revalidatePath('/', 'layout')
    redirect('/')
}

export async function signup(formData: FormData) {
    const supabase = await createClient()

    const email = formData.get('email') as string
    const password = formData.get('password') as string
    const fullName = formData.get('fullName') as string

    const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                full_name: fullName
            }
        }
    })

    if (error) {
        redirect(`/register?error=${encodeURIComponent(error.message)}`)
    }

    revalidatePath('/', 'layout')
    // Redirect to register with success=true to show the "Check email" notice
    redirect('/register?success=true')
}

export async function signout() {
    const supabase = await createClient()
    await supabase.auth.signOut()
    redirect('/login')
}

export async function loginWithGoogle() {
    const supabase = await createClient()
    const headerList = await headers()
    const host = headerList.get('x-forwarded-host') || headerList.get('host')
    // Dynamic protocol detection: use x-forwarded-proto if behind proxy, 
    // otherwise fallback to http for local IPs/localhost, or https for production
    const isLocal = host?.includes('localhost') || host?.includes('127.0.0.1') || (host && /^(\d{1,3}\.){3}\d{1,3}/.test(host))
    const proto = headerList.get('x-forwarded-proto') || (isLocal ? 'http' : 'https')
    const origin = (host ? `${proto}://${host}` : process.env.NEXT_PUBLIC_BASE_URL) || 'http://localhost:3000'


    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: `${origin}/auth/callback`,
            queryParams: {
                access_type: 'offline',
                prompt: 'consent',
            },
        },
    })

    if (error) {
        redirect(`/login?error=${encodeURIComponent(error.message)}`)
    }

    if (data.url) {
        redirect(data.url)
    }
}

export async function resetPassword(formData: FormData) {
    const supabase = await createClient()
    const email = formData.get('email') as string

    // Construct dynamic origin
    const headerList = await headers()
    const host = headerList.get('x-forwarded-host') || headerList.get('host')
    const isLocal = host?.includes('localhost') || host?.includes('127.0.0.1') || (host && /^(\d{1,3}\.){3}\d{1,3}/.test(host))
    const proto = headerList.get('x-forwarded-proto') || (isLocal ? 'http' : 'https')
    const origin = (host ? `${proto}://${host}` : process.env.NEXT_PUBLIC_BASE_URL) || 'http://localhost:3000'

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/auth/callback?next=/reset-password`,
    })

    if (error) {
        redirect(`/forgot-password?error=${encodeURIComponent(error.message)}`)
    }

    redirect('/forgot-password?success=true')
}

export async function updatePassword(formData: FormData) {
    const supabase = await createClient()
    const password = formData.get('password') as string

    const { error } = await supabase.auth.updateUser({
        password: password
    })

    if (error) {
        redirect(`/reset-password?error=${encodeURIComponent(error.message)}`)
    }

    redirect('/login?message=Contraseña actualizada correctamente')
}
