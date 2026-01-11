import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { joinFamily } from './actions'

import { SubmitButton } from '@/components/ui/molecules/SubmitButton'

export default async function JoinFamilyPage() {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) redirect('/login')

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                    Unirse a un Niddo existente
                </h2>
                <p className="mt-2 text-center text-sm text-gray-600">
                    Ingresa el código que te compartieron para unirte.
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
                    <form action={joinFamily} className="space-y-6">
                        <div>
                            <label htmlFor="inviteCode" className="block text-sm font-medium text-gray-700">
                                Código de Invitación
                            </label>
                            <div className="mt-1">
                                <input
                                    id="inviteCode"
                                    name="inviteCode"
                                    type="text"
                                    required
                                    placeholder="Ej. ABC1234"
                                    className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900 uppercase"
                                />
                            </div>
                        </div>

                        <div>
                            <SubmitButton loadingText="Uniéndose..." className="w-full">
                                Unirse al Niddo
                            </SubmitButton>
                        </div>
                    </form>


                    <div className="mt-6">
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-gray-300" />
                            </div>
                            <div className="relative flex justify-center text-sm">
                                <span className="px-2 bg-white text-gray-500">
                                    O
                                </span>
                            </div>
                        </div>

                        <div className="mt-6 text-center">
                            <Link href="/onboarding" className="font-medium text-blue-600 hover:text-blue-500">
                                Crear una nueva familia
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
