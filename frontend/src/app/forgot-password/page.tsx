'use client';

import { resetPassword } from '../login/actions'
import Link from 'next/link'
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Mail, ArrowLeft, Send } from 'lucide-react'

function ForgotPasswordForm() {
    const searchParams = useSearchParams();
    const error = searchParams.get('error');
    const success = searchParams.get('success') === 'true';

    if (success) {
        return (
            <div className="max-w-md w-full p-8 bg-white rounded-3xl shadow-xl border border-slate-100 text-center space-y-6">
                <div className="mx-auto w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center animate-bounce">
                    <Send size={32} />
                </div>
                <div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tight">¡Correo enviado!</h2>
                    <p className="mt-3 text-slate-600 font-medium">
                        Si el correo existe en nuestra base de datos, recibirás un enlace para restablecer tu contraseña.
                    </p>
                </div>
                <Link href="/login" className="block w-full py-4 px-6 bg-blue-600 text-white font-black rounded-2xl shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all uppercase tracking-widest text-xs">
                    Volver al login
                </Link>
            </div>
        );
    }

    return (
        <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-3xl shadow-xl border border-slate-100">
            <div className="text-center space-y-2">
                <div className="inline-flex p-3 bg-blue-600/10 rounded-2xl mb-2">
                    <Mail size={32} className="text-blue-600" />
                </div>
                <h1 className="text-4xl font-black text-slate-900 tracking-tight">Recuperar acceso</h1>
                <p className="text-slate-500 font-medium">Te enviaremos un enlace para que elijas una nueva contraseña</p>
            </div>

            <form className="mt-8 space-y-6">
                {error && (
                    <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-600 text-xs font-bold text-center animate-in fade-in slide-in-from-top-2">
                        {error}
                    </div>
                )}

                <div className="space-y-4">
                    <div className="relative">
                        <label htmlFor="email-address" className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 ml-1">Correo Electrónico</label>
                        <div className="relative">
                            <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            <input
                                id="email-address"
                                name="email"
                                type="email"
                                autoComplete="email"
                                required
                                className="appearance-none block w-full pl-12 pr-4 py-3.5 border border-slate-200 placeholder-slate-400 text-slate-900 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all sm:text-sm bg-slate-50/50"
                                placeholder="tu@email.com"
                            />
                        </div>
                    </div>
                </div>

                <div className="pt-2">
                    <button formAction={resetPassword} className="group relative w-full flex items-center justify-center py-4 px-4 border border-transparent text-xs font-black uppercase tracking-widest rounded-2xl text-white bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-500/20 transition-all active:scale-[0.98]">
                        Enviar enlace de recuperación
                    </button>
                </div>

                <div className="text-center">
                    <Link href="/login" className="inline-flex items-center font-medium text-slate-500 hover:text-blue-600 transition-colors">
                        <ArrowLeft size={16} className="mr-2" />
                        Volver al inicio de sesión
                    </Link>
                </div>
            </form>
        </div>
    );
}

export default function ForgotPasswordPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
            <Suspense fallback={<div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />}>
                <ForgotPasswordForm />
            </Suspense>
        </div>
    );
}
