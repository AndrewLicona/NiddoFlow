'use client';


import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, History, Target, Banknote, Settings, LogOut, Plus } from 'lucide-react';
import { signout } from '@/app/login/actions';

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
    const isAuthPage = pathname === '/login' || pathname === '/register' || pathname.startsWith('/onboarding');
    if (isAuthPage) return null;
    return (
        <>
            {/* Mobile Bottom Navigation (Island Style) */}
            <div className="fixed bottom-6 left-0 right-0 flex justify-center px-4 md:hidden z-50 pointer-events-none">
                <nav className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl border border-foreground/[0.05] shadow-[0_8px_32px_rgba(0,0,0,0.12)] rounded-[32px] px-6 py-3 flex justify-around items-center w-full max-w-[400px] pointer-events-auto">
                    {mobileNavItems.map((item) => {
                        const isActive = pathname === item.href;
                        const Icon = item.icon;

                        if (item.isFab) {
                            return (
                                <Link
                                    key="fab"
                                    href={item.href}
                                    className="flex flex-col items-center justify-center w-12 h-12 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-500/40 active:scale-90 transition-all duration-300"
                                >
                                    <Icon size={24} strokeWidth={3} />
                                </Link>
                            );
                        }

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex flex-col items-center space-y-1 transition-all duration-300 ${isActive ? 'text-blue-600' : 'text-foreground/30 hover:text-foreground/60'}`}
                            >
                                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} className={isActive ? 'drop-shadow-[0_0_8px_rgba(37,99,235,0.4)]' : ''} />
                                <span className={`text-[8px] font-black uppercase tracking-widest transition-all ${isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'}`}>
                                    {item.name}
                                </span>
                            </Link>
                        );
                    })}
                </nav>
            </div>

            {/* Desktop Sidebar Navigation */}
            <nav className="fixed left-0 top-0 bottom-0 w-24 bg-white/50 dark:bg-slate-950/50 backdrop-blur-xl border-r border-foreground/[0.05] hidden md:flex flex-col items-center py-10 z-50">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl flex items-center justify-center text-white font-black shadow-xl shadow-blue-500/20 mb-10 scale-110">
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
                                className={`p-4 rounded-[22px] transition-all duration-300 group ${isActive ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30 active:scale-95' : 'text-foreground hover:bg-foreground/[0.03] active:scale-95'}`}
                            >
                                <div className={isActive ? 'opacity-100' : 'opacity-30 group-hover:opacity-70 transition-opacity'}>
                                    <Icon size={24} strokeWidth={isActive ? 2.5 : 2} className="group-hover:scale-110 transition-transform" />
                                </div>
                            </Link>
                        );
                    })}
                </div>

                {/* Logout Button in Sidebar */}
                <form action={signout} className="mt-auto">
                    <button
                        type="submit"
                        title="Cerrar Sesión"
                        className="p-4 rounded-[22px] text-foreground/20 hover:text-rose-500 hover:bg-rose-500/10 transition-all duration-300 group"
                    >
                        <LogOut size={24} className="group-hover:-translate-x-1 transition-transform" />
                    </button>
                </form>
            </nav>
        </>
    );
};
