'use client';


import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, History, Target, Banknote, Settings, LogOut } from 'lucide-react';
import { signout } from '@/app/login/actions';

const navItems = [
    { name: 'Inicio', href: '/', icon: Home },
    { name: 'Historial', href: '/transactions', icon: History },
    { name: 'Límites', href: '/budgets', icon: Target },
    { name: 'Deudas', href: '/debts', icon: Banknote },
    { name: 'Ajustes', href: '/settings', icon: Settings },
];

export const Navigation = () => {
    const pathname = usePathname();

    return (
        <>
            {/* Mobile Bottom Navigation */}
            <nav className="fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-t border-foreground/[0.05] px-6 py-4 flex justify-between items-center md:hidden z-50">
                {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    const Icon = item.icon;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex flex-col items-center space-y-1.5 transition-all duration-300 ${isActive ? 'text-blue-600' : 'text-foreground/30 hover:text-foreground/60'}`}
                        >
                            <Icon size={24} strokeWidth={isActive ? 2.5 : 2} className={isActive ? 'drop-shadow-[0_0_8px_rgba(37,99,235,0.4)]' : ''} />
                            <span className={`text-[9px] font-black uppercase tracking-widest ${isActive ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden'}`}>
                                {item.name}
                            </span>
                        </Link>
                    );
                })}
            </nav>

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
