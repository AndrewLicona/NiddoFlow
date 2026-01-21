'use client';

import { signup, loginWithGoogle } from '../login/actions'
import Link from 'next/link'
import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Eye, EyeOff, User, Mail, Lock, Sparkles, Check, X } from 'lucide-react'

function RegisterForm() {
    const searchParams = useSearchParams();
    const error = searchParams.get('error');
    const [showPassword, setShowPassword] = useState(false);
    const [password, setPassword] = useState('');
    const requirements = {
        length: password.length >= 8,
        number: /[0-9]/.test(password),
        special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
        uppercase: /[A-Z]/.test(password),
    };

    let score = 0;
    if (requirements.length) score += 25;
    if (requirements.number) score += 25;
    if (requirements.special) score += 25;
    if (requirements.uppercase) score += 25;
    const strength = score;

    const getStrengthColor = () => {
        if (strength <= 25) return 'bg-rose-500';
        if (strength <= 50) return 'bg-amber-500';
        if (strength <= 75) return 'bg-blue-500';
        return 'bg-emerald-500';
    };

    const getStrengthText = () => {
        if (strength === 0) return '';
        if (strength <= 25) return 'Muy débil';
        if (strength <= 50) return 'Débil';
        if (strength <= 75) return 'Segura';
        return 'Muy segura';
    };

    return (
        <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-3xl shadow-xl border border-slate-100">
            <div className="text-center space-y-2">
                <div className="inline-flex p-3 bg-blue-600/10 rounded-2xl mb-2">
                    <User size={32} className="text-blue-600" />
                </div>
                <h1 className="text-4xl font-black text-slate-900 tracking-tight">Crea tu cuenta</h1>
                <p className="text-slate-500 font-medium">Únete y empieza a organizar tu economía</p>
            </div>

            <form className="mt-8 space-y-6">
                {error && (
                    <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-600 text-xs font-bold text-center animate-in fade-in slide-in-from-top-2">
                        {error}
                    </div>
                )}

                <div className="space-y-4">
                    <div className="relative">
                        <label htmlFor="full-name" className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 ml-1">Nombre Completo</label>
                        <div className="relative">
                            <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            <input
                                id="full-name"
                                name="fullName"
                                type="text"
                                required
                                className="appearance-none block w-full pl-12 pr-4 py-3.5 border border-slate-200 placeholder-slate-400 text-slate-900 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all sm:text-sm bg-slate-50/50"
                                placeholder="Andrew Licona"
                            />
                        </div>
                    </div>
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
                                autoComplete="new-password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
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

                        {/* Strength Indicator */}
                        {password && (
                            <div className="mt-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                                <div className="flex justify-between items-center px-1">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Seguridad:</span>
                                    <span className={`text-[10px] font-black uppercase tracking-widest ${getStrengthColor().replace('bg-', 'text-')}`}>
                                        {getStrengthText()}
                                    </span>
                                </div>
                                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden flex gap-1">
                                    <div className={`h-full transition-all duration-500 ${strength >= 25 ? getStrengthColor() : 'bg-transparent'} flex-1`} />
                                    <div className={`h-full transition-all duration-500 ${strength >= 50 ? getStrengthColor() : 'bg-transparent'} flex-1`} />
                                    <div className={`h-full transition-all duration-500 ${strength >= 75 ? getStrengthColor() : 'bg-transparent'} flex-1`} />
                                    <div className={`h-full transition-all duration-500 ${strength >= 100 ? getStrengthColor() : 'bg-transparent'} flex-1`} />
                                </div>
                                <div className="grid grid-cols-2 gap-2 mt-2">
                                    <RequirementItem met={requirements.length} text="Mín. 8 caracteres" />
                                    <RequirementItem met={requirements.uppercase} text="Una mayúscula" />
                                    <RequirementItem met={requirements.number} text="Un número" />
                                    <RequirementItem met={requirements.special} text="Un símbolo" />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100/50">
                    <p className="text-[10px] text-blue-800 font-medium leading-relaxed">
                        <span className="font-black uppercase tracking-widest mr-1">Aviso:</span>
                        Al registrarte, te enviaremos un correo para confirmar tu identidad.
                        <strong> Es necesario confirmarlo para poder entrar.</strong>
                    </p>
                </div>

                <div>
                    <button
                        formAction={signup}
                        disabled={strength < 75}
                        className={`group relative w-full flex items-center justify-center py-4 px-4 border border-transparent text-xs font-black uppercase tracking-widest rounded-2xl text-white transition-all active:scale-[0.98] ${strength < 75 ? 'bg-slate-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-500/20'}`}
                    >
                        Comenzar ahora
                        <Sparkles size={16} className="ml-2 group-hover:rotate-12 transition-transform" />
                    </button>
                </div>


                <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-slate-300"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                        <span className="px-2 bg-white text-slate-500">O regístrate con</span>
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

                <div className="text-center">
                    <Link href="/login" className="font-medium text-blue-600 hover:text-blue-500">
                        ¿Ya tienes cuenta? Inicia sesión
                    </Link>
                </div>
            </form>
        </div>
    );
}

function RequirementItem({ met, text }: { met: boolean; text: string }) {
    return (
        <div className="flex items-center space-x-2 transition-colors duration-300">
            <div className={`p-0.5 rounded-full ${met ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                {met ? <Check size={10} strokeWidth={4} /> : <X size={10} strokeWidth={4} />}
            </div>
            <span className={`text-[9px] font-bold uppercase tracking-wider ${met ? 'text-emerald-700' : 'text-slate-400'}`}>
                {text}
            </span>
        </div>
    );
}

function RegisterContent() {
    const searchParams = useSearchParams();
    const isSuccess = searchParams.get('success') === 'true';

    if (isSuccess) {
        return (
            <div className="max-w-md w-full p-8 bg-white rounded-3xl shadow-xl border border-slate-100 text-center space-y-6">
                <div className="mx-auto w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center animate-bounce">
                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                </div>
                <div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tight">¡Revisa tu correo!</h2>
                    <p className="mt-3 text-slate-600 font-medium">
                        Hemos enviado un enlace de confirmación a tu cuenta. Por favor, confírmalo para empezar a usar NiddoFlow.
                    </p>
                </div>
                <Link href="/login" className="block w-full py-4 px-6 bg-blue-600 text-white font-black rounded-2xl shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all uppercase tracking-widest text-xs">
                    Ir al inicio de sesión
                </Link>
            </div>
        );
    }

    return <RegisterForm />;
}

export default function RegisterPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
            <Suspense fallback={<div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />}>
                <RegisterContent />
            </Suspense>
        </div>
    );
}
