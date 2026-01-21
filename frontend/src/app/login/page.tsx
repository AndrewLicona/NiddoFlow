'use client';

import { login, loginWithGoogle } from './actions'
import Link from 'next/link'
import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Eye, EyeOff, Lock, Mail, ArrowRight } from 'lucide-react'

function LoginForm() {
    const searchParams = useSearchParams();
    const next = searchParams.get('next');
    const error = searchParams.get('error');
    const [showPassword, setShowPassword] = useState(false);

    return (
        <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-2xl shadow-xl border border-slate-100">
            <div className="text-center space-y-2">
                <div className="inline-flex p-3 bg-blue-600/10 rounded-2xl mb-2">
                    <Lock size={32} className="text-blue-600" />
                </div>
                <h1 className="text-4xl font-black text-slate-900 tracking-tight">NiddoFlow</h1>
                <p className="text-slate-500 font-medium">Gestiona tus finanzas familiares con claridad</p>
            </div>

            <form className="mt-8 space-y-6">
                {next && <input type="hidden" name="next" value={next} />}

                {error && (
                    <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 text-[10px] font-black uppercase tracking-widest text-center animate-in fade-in slide-in-from-top-2">
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
                    <div className="relative">
                        <label htmlFor="password" className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 ml-1">Contraseña</label>
                        <div className="relative">
                            <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            <input
                                id="password"
                                name="password"
                                type={showPassword ? 'text' : 'password'}
                                autoComplete="current-password"
                                required
                                className="appearance-none block w-full pl-12 pr-12 py-3.5 border border-slate-200 placeholder-slate-400 text-slate-900 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all sm:text-sm bg-slate-50/50"
                                placeholder="••••••••"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                        <div className="mt-1 flex justify-end">
                            <Link href="/forgot-password" title="Recuperar contraseña" className="text-[10px] font-bold text-slate-400 hover:text-blue-600 uppercase tracking-widest transition-colors">
                                ¿Olvidaste tu contraseña?
                            </Link>
                        </div>
                    </div>
                </div>

                <div className="pt-2">
                    <button formAction={login} className="group relative w-full flex items-center justify-center py-4 px-4 border border-transparent text-xs font-black uppercase tracking-widest rounded-2xl text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-xl shadow-blue-500/20 transition-all active:scale-[0.98]">
                        Entrar a NiddoFlow
                        <ArrowRight size={16} className="ml-2 group-hover:translate-x-1 transition-transform" />
                    </button>
                </div>

                <div className="text-center">
                    <Link href="/register" className="font-medium text-blue-600 hover:text-blue-500">
                        ¿No tienes cuenta? Regístrate
                    </Link>
                </div>

                <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-slate-300"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                        <span className="px-2 bg-white text-slate-500">O continúa con</span>
                    </div>
                </div>

                <button formAction={loginWithGoogle} formNoValidate className="w-full flex items-center justify-center px-4 py-2 border border-slate-300 shadow-sm text-sm font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors">
                    <svg className="h-5 w-5 mr-2" aria-hidden="true" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                    Google
                </button>
            </form>
        </div>
    );
}

export default function LoginPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <Suspense fallback={<div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />}>
                <LoginForm />
            </Suspense>
        </div>
    );
}
