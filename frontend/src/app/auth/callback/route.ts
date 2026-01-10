import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const url = new URL(request.url)
    const code = searchParams.get('code')
    // if "next" is in param, use it as the redirect URL
    const next = searchParams.get('next') ?? '/'

    // Use the origin from environment variable or headers to avoid internal Docker URL redirects
    const origin = process.env.NEXT_PUBLIC_BASE_URL ||
        (request.headers.get('x-forwarded-proto') && request.headers.get('x-forwarded-host')
            ? `${request.headers.get('x-forwarded-proto')}://${request.headers.get('x-forwarded-host')}`
            : url.origin)

    console.log('--- Auth Callback ---')
    console.log('Origin detected:', origin)
    console.log('Code present:', !!code)
    console.log('Redirecting to:', `${origin}${next}`)

    if (code) {
        const supabase = await createClient()
        const { error } = await supabase.auth.exchangeCodeForSession(code)

        if (error) {
            console.error('Auth code exchange error:', error.message)
            return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`)
        }

        console.log('Auth successful!')
        return NextResponse.redirect(`${origin}${next}`)
    }

    console.warn('No code provided in auth callback')
    return NextResponse.redirect(`${origin}/login?error=No code provided`)
}
