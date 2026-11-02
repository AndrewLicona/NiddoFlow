import { type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

export async function middleware(request: NextRequest) {
    return await updateSession(request)
}



export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         *
         * IMPORTANTE: `manifest.json` y `sw.js` tambien deben quedar fuera.
         * Antes el matcher los capturaba y el middleware los redirigia a
         * /login (307). Eso rompia dos cosas:
         *   1. El navegador recibia HTML donde esperaba JSON ->
         *      "Manifest: Line: 1, column: 1, Syntax error."
         *   2. El service worker recibia una redireccion ->
         *      "SW registration failed: The script resource is behind a
         *       redirect, which is disallowed."
         *
         * Feel free to modify this pattern to include more paths.
         */
        '/((?!_next/static|_next/image|favicon.ico|manifest\\.json|manifest\\.webmanifest|sw\\.js|service-worker\\.js|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)',
    ],
}
