'use client';


import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, History, Target, Banknote, Settings, LogOut, Plus } from 'lucide-react';
import { signout } from '@/app/login/actions';
import { useState } from 'react';

const navItems = [
    { name: 'Inicio', href: '/', icon: Home },
    { name: 'Historial', href: '/transactions', icon: History },
    { name: 'Límites', href: '/budgets', icon: Target },
    { name: 'Deudas', href: '/debts', icon: Banknote },
    { name: 'Ajustes', href: '/settings', icon: Settings },
];

const mobileNavItems = [
    { name: 'Inicio', href: '/', icon: Home },
    { name: 'Límites', href: '/budgets', icon: Target },
    { name: 'Abono', href: '/transactions', icon: Plus, isFab: true },
    { name: 'Deudas', href: '/debts', icon: Banknote },
    { name: 'Más', href: '/settings', icon: Settings },
];
export const Navigation = () => {
    const pathname = usePathname();
    const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

    // Only imports are verified, assuming useState is added to imports below

    const isAuthPage = pathname === '/login' || pathname === '/register' || pathname.startsWith('/onboarding');
    if (isAuthPage) return null;
    return (
        <>
            {/* Mobile Bottom Navigation (Island Style) */}
            {/* Mobile Bottom Navigation (Island Style) */}
            <div className="fixed bottom-6 left-0 right-0 flex justify-center px-4 md:hidden z-50 pointer-events-none">
                <nav className="bg-card/90 backdrop-blur-2xl border border-foreground/[0.05] shadow-[0_8px_32px_rgba(0,0,0,0.12)] rounded-[32px] px-6 py-3 flex justify-around items-center w-full max-w-[400px] pointer-events-auto">
                    {mobileNavItems.map((item) => {
                        const isActive = pathname === item.href;
                        const Icon = item.icon;

                        if (item.isFab) {
                            return (
                                <Link
                                    key="fab"
                                    href={item.href}
                                    className="flex flex-col items-center justify-center w-12 h-12 bg-primary text-primary-foreground rounded-2xl shadow-lg shadow-primary/40 active:scale-90 transition-all duration-300"
                                >
                                    <Icon size={24} strokeWidth={3} />
                                </Link>
                            );
                        }

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex flex-col items-center space-y-1 transition-all duration-300 ${isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} className={isActive ? 'drop-shadow-[0_0_8px_rgba(var(--primary),0.4)]' : ''} />
                                <span className={`text-[8px] font-black uppercase tracking-widest transition-all ${isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'}`}>
                                    {item.name}
                                </span>
                            </Link>
                        );
                    })}
                </nav>
            </div>

            {/* Desktop Sidebar Navigation */}
            <nav className="fixed left-0 top-0 bottom-0 w-24 bg-background/50 backdrop-blur-xl border-r border-foreground/[0.05] hidden md:flex flex-col items-center py-10 z-50">
                <div className="w-12 h-12 bg-gradient-to-br from-primary to-primary/80 rounded-2xl flex items-center justify-center text-primary-foreground font-black shadow-xl shadow-primary/20 mb-10 scale-110">
                    N
                </div>

                <div className="flex-1 flex flex-col items-center space-y-8">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href;
                        const Icon = item.icon;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                title={item.name}
                                className={`p-4 rounded-[22px] transition-all duration-300 group ${isActive ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30 active:scale-95' : 'text-muted-foreground hover:bg-foreground/[0.03] hover:text-foreground active:scale-95'}`}
                            >
                                <div className={isActive ? 'opacity-100' : 'opacity-50 group-hover:opacity-100 transition-opacity'}>
                                    <Icon size={24} strokeWidth={isActive ? 2.5 : 2} className="group-hover:scale-110 transition-transform" />
                                </div>
                            </Link>
                        );
                    })}
                </div>

                {/* Logout Button in Sidebar */}
                <div className="mt-auto flex flex-col gap-4 items-center">
                    <button
                        onClick={() => setIsLogoutModalOpen(true)}
                        title="Cerrar Sesión"
                        className="p-4 rounded-[22px] text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-all duration-300 group"
                    >
                        <LogOut size={24} className="group-hover:-translate-x-1 transition-transform" />
                    </button>
                </div>
            </nav>

            {/* Logout Confirmation Modal */}
            {isLogoutModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setIsLogoutModalOpen(false)} />
                    <div className="relative bg-card w-full max-w-sm rounded-[32px] p-8 shadow-2xl border border-border flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
                        <div className="w-16 h-16 bg-rose-500/10 text-rose-500 rounded-3xl flex items-center justify-center mb-6">
                            <LogOut size={32} />
                        </div>
                        <h3 className="text-xl font-bold mb-2">¿Cerrar Sesión?</h3>
                        <p className="text-foreground/60 mb-8 text-sm">
                            Tendrás que volver a ingresar tus credenciales para acceder.
                        </p>
                        <div className="flex flex-col gap-3 w-full">
                            <form action={signout} className="w-full">
                                <button
                                    type="submit"
                                    className="w-full py-4 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-2xl transition-colors shadow-lg shadow-rose-500/20"
                                >
                                    Sí, salir ahora
                                </button>
                            </form>
                            <button
                                onClick={() => setIsLogoutModalOpen(false)}
                                className="w-full py-4 text-foreground/40 hover:text-foreground font-bold hover:bg-foreground/[0.03] rounded-2xl transition-colors"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
