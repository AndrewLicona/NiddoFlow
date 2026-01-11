import { createFamily } from './actions'
import { SubmitButton } from '@/components/ui/molecules/SubmitButton'

export default function OnboardingPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-2xl shadow-xl border border-slate-100">
                <div className="text-center">
                    <h1 className="text-3xl font-extrabold text-blue-600 tracking-tight">Crea tu Familia</h1>
                    <p className="mt-2 text-sm text-slate-600">
                        Para comenzar, necesitamos crear un espacio para tu familia o grupo.
                    </p>
                </div>

                <form className="mt-8 space-y-6" action={createFamily}>
                    <div className="rounded-md shadow-sm -space-y-px">
                        <div>
                            <label htmlFor="family-name" className="sr-only">Nombre de la Familia</label>
                            <input
                                id="family-name"
                                name="familyName"
                                type="text"
                                required
                                className="appearance-none rounded-md relative block w-full px-3 py-2 border border-slate-300 placeholder-slate-500 text-slate-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                                placeholder="Ej. Familia Pérez o Casa de la Playa"
                            />
                        </div>
                    </div>

                    <div>
                        <SubmitButton loadingText="Creando Familia..." className="w-full">
                            Crear Familia
                        </SubmitButton>
                    </div>
                </form>


                <div className="mt-6 text-center">
                    <p className="text-sm text-gray-600">
                        ¿Ya tienes un código?{' '}
                        <a href="/onboarding/join" className="font-medium text-blue-600 hover:text-blue-500">
                            Unirse a una familia existente
                        </a>
                    </p>
                </div>
            </div>
        </div>
    )
}
