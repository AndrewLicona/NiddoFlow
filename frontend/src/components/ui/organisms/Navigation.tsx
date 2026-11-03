'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    Home, History, Target, Banknote, Settings, LogOut, Plus, Landmark,
    ShoppingBasket, Flag, Receipt, MoreHorizontal,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { signout } from '@/app/login/actions';
import { useEffect, useState } from 'react';

/**
 * Navegacion de escritorio.
 *
 * `short` es la etiqueta que se muestra bajo el icono en el rail (el
 * nombre completo sigue en el title y en el sheet de mobile).
 */
const navItems = [
    { name: 'Inicio', short: 'Inicio', href: '/', icon: Home },
    { name: 'Historial', short: 'Historial', href: '/transactions', icon: History },
    { name: 'Límites', short: 'Límites', href: '/budgets', icon: Target },
    { name: 'Deudas', short: 'Deudas', href: '/debts', icon: Banknote },
    { name: 'Importar movimientos', short: 'Importar', href: '/import', icon: Landmark },
    { name: 'Necesidades', short: 'Necesidades', href: '/shopping', icon: ShoppingBasket },
    // Antes "Metas" reutilizaba el icono Target de "Límites" y "Cuentas del
    // hogar" el Home de "Inicio": dos pares de iconos identicos en el menu.
    { name: 'Metas', short: 'Metas', href: '/goals', icon: Flag },
    { name: 'Cuentas del hogar', short: 'Hogar', href: '/bills', icon: Receipt },
    { name: 'Ajustes', short: 'Ajustes', href: '/settings', icon: Settings },
];

/**
 * Isla inferior de mobile: los 4 destinos de uso diario mas la accion de
 * registrar. El resto de destinos vive en el sheet de "Más".
 */
const mobileNavItems = [
    { name: 'Inicio', href: '/', icon: Home },
    { name: 'Límites', href: '/budgets', icon: Target },
    { name: 'Abono', href: '/transactions', icon: Plus, isFab: true },
    { name: 'Deudas', href: '/debts', icon: Banknote },
    { name: 'Más', href: '#', icon: MoreHorizontal, isMore: true },
];

/**
 * Destinos que no caben en la isla de mobile. Sin este bloque, desde el
 * celular era imposible llegar a Necesidades, Metas, Cuentas del hogar,
 * Importar o el Historial.
 */
const moreItems = [
    { name: 'Necesidades', href: '/shopping', icon: ShoppingBasket },
    { name: 'Metas', href: '/goals', icon: Flag },
    { name: 'Cuentas del hogar', href: '/bills', icon: Receipt },
    { name: 'Importar', href: '/import', icon: Landmark },
    { name: 'Historial', href: '/transactions', icon: History },
    { name: 'Ajustes', href: '/settings', icon: Settings },
];

export const Navigation = () => {
    const pathname = usePathname();
    const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
    const [isMoreOpen, setIsMoreOpen] = useState(false);

    // Escape cierra el sheet de "Más".
    useEffect(() => {
        if (!isMoreOpen) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setIsMoreOpen(false);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isMoreOpen]);

    const isAuthPage = pathname === '/login' || pathname === '/register' || pathname.startsWith('/onboarding');
    if (isAuthPage) return null;
    return (
        <>
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

                        // "Más" abre el sheet con el resto de destinos.
                        if (item.isMore) {
                            return (
                                <button
                                    key="more"
                                    type="button"
                                    onClick={() => setIsMoreOpen(true)}
                                    className={`flex flex-col items-center space-y-1 transition-all duration-300 ${isMoreOpen ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                                >
                                    <Icon size={20} strokeWidth={isMoreOpen ? 2.5 : 2} />
                                    <span className={`text-[8px] font-black uppercase tracking-widest transition-all ${isMoreOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'}`}>
                                        {item.name}
                                    </span>
                                </button>
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

            {/* ── Sheet de mobile con el resto de destinos ───────────── */}
            <AnimatePresence>
                {isMoreOpen && (
                    <div className="fixed inset-0 z-[60] md:hidden">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            onClick={() => setIsMoreOpen(false)}
                            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
                            className="absolute bottom-0 left-0 right-0 bg-card border-t border-foreground/[0.06] rounded-t-[32px] shadow-[0_-8px_32px_rgba(0,0,0,0.18)] px-5 pt-4 pb-10"
                        >
                            <div className="w-10 h-1 rounded-full bg-foreground/10 mx-auto mb-4" />
                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-4 text-center">
                                Todo el menú
                            </p>
                            <div className="grid grid-cols-3 gap-3">
                                {moreItems.map((item) => {
                                    const Icon = item.icon;
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            onClick={() => setIsMoreOpen(false)}
                                            className="flex flex-col items-center justify-center gap-2 min-h-[76px] rounded-2xl border border-foreground/[0.06] bg-foreground/[0.02] px-2 py-3 text-center transition-all active:scale-95"
                                        >
                                            <Icon size={22} className="text-muted-foreground" />
                                            <span className="text-[10px] font-black uppercase tracking-tight text-foreground/70 leading-tight">
                                                {item.name}
                                            </span>
                                        </Link>
                                    );
                                })}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Desktop Sidebar Navigation */}
            <nav className="fixed left-0 top-0 bottom-0 w-28 bg-background/50 backdrop-blur-xl border-r border-foreground/[0.05] hidden md:flex flex-col items-center py-6 z-50">
                <div className="w-12 h-12 bg-gradient-to-br from-primary to-primary/80 rounded-2xl flex items-center justify-center text-primary-foreground font-black shadow-xl shadow-primary/20 mb-6 scale-110">
                    N
                </div>

                {/* Etiqueta siempre visible bajo el icono: el menu se
                    explica solo sin depender del tooltip. El ritmo vertical
                    compacto evita el scroll en pantallas de 768px. */}
                <div className="flex-1 flex flex-col items-center gap-1 overflow-y-auto w-full px-2">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href;
                        const Icon = item.icon;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                title={item.name}
                                className={`w-full flex flex-col items-center gap-1 py-2 rounded-2xl transition-all duration-300 group ${isActive ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30' : 'text-muted-foreground hover:bg-foreground/[0.03] hover:text-foreground active:scale-95'}`}
                            >
                                <Icon size={22} strokeWidth={isActive ? 2.5 : 2} className="group-hover:scale-110 transition-transform" />
                                <span className={`w-full truncate text-center text-[9px] font-black uppercase leading-none tracking-tight ${isActive ? 'text-primary-foreground/90' : 'text-foreground/45 group-hover:text-foreground/70'}`}>
                                    {item.short}
                                </span>
                            </Link>
                        );
                    })}
                </div>

                {/* Logout Button in Sidebar */}
                <div className="mt-auto flex flex-col items-center w-full px-2">
                    <button
                        onClick={() => setIsLogoutModalOpen(true)}
                        title="Cerrar Sesión"
                        className="w-full flex flex-col items-center gap-1 py-2 rounded-2xl text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-all duration-300 group"
                    >
                        <LogOut size={22} className="group-hover:-translate-x-1 transition-transform" />
                        <span className="w-full truncate text-center text-[9px] font-black uppercase leading-none tracking-tight text-foreground/45 group-hover:text-rose-500/80">
                            Salir
                        </span>
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
