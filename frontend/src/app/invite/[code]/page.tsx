import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { joinFamilyByCode } from './actions'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()

    // Await params correctly for Next.js 15
    const { code } = await params

    if (!session) {
        redirect(`/login?next=/invite/${code}`)
    }

    // Fetch Family Details to show name
    const { data: families, error } = await supabase
        .from('families')
        .select('*')
        .eq('invite_code', code)
        .limit(1)

    const family = families && families.length > 0 ? families[0] : null

    if (!family) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
                <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
                    <h2 className="text-3xl font-extrabold text-gray-900">Invitación no válida</h2>
                    <p className="mt-2 text-gray-600">El código <span className="font-mono font-bold bg-gray-200 px-1 rounded">{code}</span> no existe o ha expirado.</p>
                    <div className="mt-6">
                        <Link href="/" className="text-blue-600 hover:text-blue-500 font-medium">Ir al Inicio</Link>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 text-center">
                    <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-blue-100 mb-6">
                        <span className="text-2xl">🏠</span>
                    </div>

                    <h2 className="text-2xl font-bold text-gray-900 mb-2">
                        Te han invitado a unirte a
                    </h2>
                    <p className="text-xl font-bold text-blue-600 mb-6">
                        {family.name}
                    </p>

                    <form action={async () => {
                        'use server'
                        await joinFamilyByCode(code)
                    }}>
                        <button
                            type="submit"
                            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                        >
                            Unirse a la Familia
                        </button>
                    </form>

                    <div className="mt-6">
                        <Link href="/" className="text-gray-500 hover:text-gray-700 text-sm">
                            Cancelar y volver al inicio
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    )
}
