import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    // CRITICAL FIX: Pass ALL options (maxAge, httpOnly, secure, sameSite)
                    // so Supabase session cookies persist correctly across requests.
                    // Previously only `name` and `value` were forwarded, which caused
                    // sessions to expire rapidly because the `maxAge` option was dropped.
                    cookiesToSet.forEach(({ name, value }) => {
                        request.cookies.set(name, value)
                        // Next.js no expone `set` con opciones en `request.cookies`;
                        // las opciones se aplican abajo, sobre la respuesta, que
                        // es lo que realmente llega al navegador.
                    })
                    supabaseResponse = NextResponse.next({
                        request,
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    // Do NOT remove this line. It's critical for session refresh.
    const {
        data: { user },
    } = await supabase.auth.getUser()

    // Protected routes logic
    //
    // Rutas publicas exactas: se comparan por pathname completo para no
    // capturar rutas parecidas por prefijo.
    const PUBLIC_EXACT_ROUTES = new Set([
        '/',
        '/forgot-password',
        '/reset-password',
    ])

    // Rutas publicas por prefijo (y sus subrutas).
    const PUBLIC_PREFIXES = [
        '/login',
        '/register',
        '/auth', // incluye /auth/callback (intercambio del codigo OAuth)
        '/onboarding', // onboarding handles its own internal auth check
    ]

    const { pathname } = request.nextUrl
    const isPublicRoute =
        PUBLIC_EXACT_ROUTES.has(pathname) ||
        PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))

    if (!user && !isPublicRoute) {
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
    }

    return supabaseResponse
}

