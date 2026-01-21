'use client';

import { updatePassword } from '../login/actions'
import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Eye, EyeOff, Check, X, Sparkles, KeyRound } from 'lucide-react'

function ResetPasswordForm() {
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
        if (strength <= 75) return 'bg-primary';
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
        <div className="max-w-md w-full space-y-8 p-8 bg-card rounded-3xl shadow-xl border border-border">
            <div className="text-center space-y-2">
                <div className="inline-flex p-3 bg-primary/10 rounded-2xl mb-2">
                    <KeyRound size={32} className="text-primary" />
                </div>
                <h1 className="text-4xl font-black text-foreground tracking-tight">Nueva contraseña</h1>
                <p className="text-muted-foreground font-medium">Elige una contraseña segura para tu cuenta</p>
            </div>

            <form className="mt-8 space-y-6">
                {error && (
                    <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-600 text-xs font-bold text-center animate-in fade-in slide-in-from-top-2">
                        {error}
                    </div>
                )}

                <div className="space-y-4">
                    <div className="relative">
                        <label htmlFor="password" className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5 ml-1">Nueva Contraseña</label>
                        <div className="relative group">
                            <KeyRound size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                            <input
                                id="password"
                                name="password"
                                type={showPassword ? 'text' : 'password'}
                                autoComplete="new-password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="appearance-none block w-full pl-12 pr-12 py-3.5 border border-input placeholder-muted-foreground text-foreground rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary transition-all sm:text-sm bg-accent/50"
                                placeholder="••••••••"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>

                        {/* Strength Indicator */}
                        {password && (
                            <div className="mt-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                                <div className="flex justify-between items-center px-1">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Seguridad:</span>
                                    <span className={`text-[10px] font-black uppercase tracking-widest ${getStrengthColor().replace('bg-', 'text-')}`}>
                                        {getStrengthText()}
                                    </span>
                                </div>
                                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden flex gap-1">
                                    <div className={`h-full transition-all duration-500 ${strength >= 25 ? getStrengthColor() : 'bg-transparent'} flex-1`} />
                                    <div className={`h-full transition-all duration-500 ${strength >= 50 ? getStrengthColor() : 'bg-transparent'} flex-1`} />
                                    <div className={`h-full transition-all duration-500 ${strength >= 75 ? getStrengthColor() : 'bg-transparent'} flex-1`} />
                                    <div className={`h-full transition-all duration-500 ${strength >= 100 ? getStrengthColor() : 'bg-transparent'} flex-1`} />
                                </div>
                                <div className="grid grid-cols-2 gap-2 mt-2">
                                    <div className="flex items-center space-x-2">
                                        <div className={`p-0.5 rounded-full ${requirements.length ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                                            {requirements.length ? <Check size={10} strokeWidth={4} /> : <X size={10} strokeWidth={4} />}
                                        </div>
                                        <span className={`text-[9px] font-bold uppercase tracking-wider ${requirements.length ? 'text-emerald-700' : 'text-slate-400'}`}>Mín. 8 caracteres</span>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <div className={`p-0.5 rounded-full ${requirements.uppercase ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                                            {requirements.uppercase ? <Check size={10} strokeWidth={4} /> : <X size={10} strokeWidth={4} />}
                                        </div>
                                        <span className={`text-[9px] font-bold uppercase tracking-wider ${requirements.uppercase ? 'text-emerald-700' : 'text-slate-400'}`}>Una mayúscula</span>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <div className={`p-0.5 rounded-full ${requirements.number ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                                            {requirements.number ? <Check size={10} strokeWidth={4} /> : <X size={10} strokeWidth={4} />}
                                        </div>
                                        <span className={`text-[9px] font-bold uppercase tracking-wider ${requirements.number ? 'text-emerald-700' : 'text-slate-400'}`}>Un número</span>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <div className={`p-0.5 rounded-full ${requirements.special ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                                            {requirements.special ? <Check size={10} strokeWidth={4} /> : <X size={10} strokeWidth={4} />}
                                        </div>
                                        <span className={`text-[9px] font-bold uppercase tracking-wider ${requirements.special ? 'text-emerald-700' : 'text-slate-400'}`}>Un símbolo</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="pt-2">
                    <button
                        formAction={updatePassword}
                        disabled={strength < 75}
                        className={`group relative w-full flex items-center justify-center py-4 px-4 border border-transparent text-xs font-black uppercase tracking-widest rounded-2xl text-primary-foreground transition-all active:scale-[0.98] ${strength < 75 ? 'bg-muted cursor-not-allowed text-muted-foreground' : 'bg-primary hover:bg-primary/90 shadow-xl shadow-primary/20'}`}
                    >
                        Actualizar contraseña
                        <Sparkles size={16} className="ml-2 group-hover:rotate-12 transition-transform" />
                    </button>
                </div>
            </form>
        </div>
    );
}

export default function ResetPasswordPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
            <Suspense fallback={<div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />}>
                <ResetPasswordForm />
            </Suspense>
        </div>
    );
}
