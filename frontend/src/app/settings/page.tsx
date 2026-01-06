import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import SettingsForm from './SettingsForm'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'

async function getFamilyData(token: string) {
    const res = await fetch(`${API_URL}/families/`, {
        headers: {
            'Authorization': `Bearer ${token}`
        },
        cache: 'no-store'
    })
    if (!res.ok) return null
    const families = await res.json()
    return families.length > 0 ? families[0] : null
}

async function getFamilyMembers(token: string) {
    const res = await fetch(`${API_URL}/families/members`, {
        headers: {
            'Authorization': `Bearer ${token}`
        },
        cache: 'no-store'
    })
    if (!res.ok) return []
    return res.json()
}

export default async function SettingsPage() {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) redirect('/login')

    const [family, members] = await Promise.all([
        getFamilyData(session.access_token),
        getFamilyMembers(session.access_token)
    ])

    // If no family, should we redirect to onboarding?
    // Probably yes, but let's handle the null case gracefully just in case
    if (!family) {
        redirect('/onboarding')
    }

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-3xl mx-auto">
                <div className="mb-6 flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Configuración</h1>
                        <p className="mt-1 text-sm text-gray-500">Gestiona tu perfil y tu familia.</p>
                    </div>
                    <Link href="/" className="text-blue-600 hover:text-blue-800 font-medium">
                        &larr; Volver al Dashboard
                    </Link>
                </div>

                <SettingsForm family={family} members={members} />
            </div>
        </div>
    )
}
