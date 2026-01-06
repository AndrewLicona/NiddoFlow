import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { signout } from './login/actions'

export default async function DashboardPage() {
    const supabase = await createClient()

    // 1. Get User
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // 2. Check if user has a family (via Profile)
    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

    if (!profile?.family_id) {
        redirect('/onboarding')
    }

    // Determine display name: Metadata > Profile > Email
    const displayName = user.user_metadata?.full_name || profile.full_name || user.email

    return (
        <div className="min-h-screen bg-gray-100 p-8">
            <div className="max-w-4xl mx-auto">
                <h1 className="text-3xl font-bold text-gray-900 mb-6">Dashboard</h1>
                <div className="bg-white rounded-lg shadow p-6">
                    <p className="text-lg text-gray-700">Hola, <span className="font-semibold">{displayName}</span></p>
                    <div className="mt-4 p-4 bg-green-50 rounded-md border border-green-100">
                        <p className="text-sm text-green-700">
                            ¡Familia configurada correctamente!
                            ID de Familia: {profile.family_id}
                        </p>
                    </div>
                    <div className="mt-4 p-4 bg-blue-50 rounded-md border border-blue-100">
                        <p className="text-sm text-blue-700">
                            Phase 1 Complete: Authentication & Family Setup working.
                        </p>
                    </div>
                </div>

                <form action={signout} className="mt-6">
                    <button className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded transition-colors">
                        Cerrar Sesión
                    </button>
                </form>
            </div>
        </div>
    )
}
