import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import SettingsForm from './SettingsForm'
import { PageHeader } from '@/components/ui/molecules/PageHeader';

import { signout } from '../login/actions';
import { Button } from '@/components/ui/atoms/Button';
import { LogOut } from 'lucide-react';

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

    if (!family) {
        redirect('/onboarding')
    }

    return (
        <main className="max-w-4xl mx-auto p-4 md:p-8 space-y-8">
            <PageHeader
                title="Configuración"
                description="Gestiona tu perfil, familia y preferencias del sistema."
                backHref="/"
                actions={
                    <form action={signout}>
                        <Button type="submit" variant="ghost" size="sm" className="text-foreground/40 hover:text-rose-500">
                            <LogOut size={16} className="mr-2" />
                            Cerrar Sesión
                        </Button>
                    </form>
                }
            />

            <SettingsForm family={family} members={members} />
        </main>
    )
}
