/**
 * Utilidades para traducir fallos de red de Supabase a mensajes accionables.
 *
 * El error por defecto del runtime es "fetch failed", que no dice nada. En
 * NiddoFlow la causa mas frecuente es que el container no resuelve DNS hacia
 * Supabase (ver scripts/fix_docker_networking.sh), asi que lo dejamos claro.
 */

/** Error que lanza el fetch nativo cuando no hay red o falla el DNS. */
function isNetworkError(error: unknown): boolean {
    if (!error) return false

    const err = error as { message?: string; cause?: { code?: string; errno?: number } }
    const message = (err.message ?? '').toLowerCase()

    if (message.includes('fetch failed')) return true
    if (message.includes('networkerror')) return true
    if (message.includes('eai_again')) return true
    if (message.includes('getaddrinfo')) return true
    if (message.includes('enotfound')) return true

    const code = err.cause?.code
    if (code === 'EAI_AGAIN' || code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'ETIMEDOUT') {
        return true
    }

    return false
}

/**
 * Devuelve un mensaje comprensible para el usuario cuando la llamada a
 * Supabase no pudo llegar al servidor.
 */
export function describeAuthNetworkError(error: unknown): string {
    if (!isNetworkError(error)) {
        const message = (error as { message?: string })?.message
        return message ?? 'No se pudo iniciar sesion.'
    }

    return 'No pudimos conectar con el servidor de autenticacion: el contenedor no esta resolviendo el dominio de Supabase (DNS). Revisa la salida a internet del contenedor en el host: sudo bash scripts/fix_docker_networking.sh'
}
