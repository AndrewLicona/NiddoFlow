'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Typography } from '@/components/ui/atoms/Typography';
import { Card } from '@/components/ui/molecules/Card';
import {
    Wallet,
    ShieldCheck,
    Users,
    ChartPie,
    ArrowRight,
    CheckCircle2,
    TrendingUp
} from 'lucide-react';

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-white selection:bg-blue-100 selection:text-blue-900 overflow-x-hidden">
            {/* Nav */}
            <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-4 flex justify-between items-center bg-white/80 backdrop-blur-xl border-b border-slate-100">
                <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-black shadow-lg shadow-blue-500/20">
                        N
                    </div>
                    <Typography variant="h3" className="text-xl font-black tracking-tighter text-slate-900">NiddoFlow</Typography>
                </div>
                <div className="hidden md:flex items-center space-x-6">
                    <Link href="/login" className="text-sm font-bold text-slate-600 px-4 py-2 hover:bg-slate-50 rounded-xl transition-colors">
                        Entrar
                    </Link>
                    <Link href="/register" className="bg-blue-600 text-white text-sm font-bold px-6 py-2.5 rounded-xl shadow-xl shadow-blue-500/20 hover:bg-blue-700 transition-all">
                        Empezar ahora
                    </Link>
                </div>
                <div className="flex md:hidden items-center space-x-2">
                    <Link href="/login" className="text-xs font-bold text-slate-600 px-3 py-2">
                        Entrar
                    </Link>
                    <Link href="/register" className="bg-blue-600 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-lg shadow-blue-500/20">
                        Registrar
                    </Link>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 px-6">
                <div className="max-w-4xl mx-auto text-center space-y-10">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                        className="space-y-6"
                    >
                        <h1 className="text-5xl md:text-7xl font-black text-slate-950 leading-[1.1] tracking-tight">
                            Control financiero <br /> <span className="text-blue-600">para tu familia.</span>
                        </h1>
                        <Typography variant="body" className="text-lg md:text-xl text-slate-500 max-w-2xl mx-auto leading-relaxed">
                            Gestiona ingresos, gastos y presupuestos compartidos de forma sencilla y transparente. Tu hogar, en total armonía financiera.
                        </Typography>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
                            <Link href="/register" className="inline-flex items-center justify-center bg-blue-600 text-white px-10 py-5 text-base font-black rounded-2xl shadow-2xl shadow-blue-600/30 hover:bg-blue-700 transition-all group">
                                Crear Cuenta Gratis
                                <ArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" />
                            </Link>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.8, delay: 0.2 }}
                        className="relative pt-10"
                    >
                        <div className="absolute -inset-4 bg-blue-100 rounded-[48px] blur-3xl opacity-30 -z-10" />
                        <div className="bg-slate-50 aspect-video rounded-[32px] border border-slate-200 shadow-2xl flex items-center justify-center p-8 overflow-hidden group">
                            <div className="w-full h-full bg-white rounded-2xl border border-slate-100 shadow-inner flex flex-col p-6 space-y-6">
                                <div className="h-4 w-1/3 bg-slate-100 rounded-lg animate-pulse" />
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="h-24 bg-blue-50/50 rounded-xl" />
                                    <div className="h-24 bg-emerald-50/50 rounded-xl" />
                                    <div className="h-24 bg-amber-50/50 rounded-xl" />
                                </div>
                                <div className="space-y-3">
                                    <div className="h-4 w-full bg-slate-50 rounded-lg" />
                                    <div className="h-4 w-5/6 bg-slate-50 rounded-lg" />
                                    <div className="h-4 w-4/6 bg-slate-50 rounded-lg" />
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Feature Bento Grid */}
            <section id="features" className="py-24 bg-slate-50 px-6">
                <div className="max-w-6xl mx-auto space-y-20">
                    <div className="text-center space-y-4 max-w-2xl mx-auto">
                        <h2 className="text-4xl font-black text-slate-950 tracking-tight">Diseñado para ser simple.</h2>
                        <p className="text-slate-500 font-medium">Todas las herramientas que necesitas para organizar tu economía familiar sin complicaciones.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Card variant="flat" className="p-8 space-y-6 bg-white border border-slate-100 shadow-sm transition-all group">
                            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                                <Wallet size={24} />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-xl font-bold text-slate-900">Control de Gastos</h3>
                                <p className="text-slate-500 text-sm leading-relaxed">Registra tus movimientos diarios de forma rápida y categórica desde cualquier dispositivo.</p>
                            </div>
                        </Card>

                        <Card variant="flat" className="p-8 space-y-6 bg-white border border-slate-100 shadow-sm transition-all group">
                            <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
                                <Users size={24} />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-xl font-bold text-slate-900">Uso Familiar</h3>
                                <p className="text-slate-500 text-sm leading-relaxed">Comparte cuentas con tu pareja o familiares para tener una visión unificada de los fondos del hogar.</p>
                            </div>
                        </Card>

                        <Card variant="flat" className="p-8 space-y-6 bg-white border border-slate-100 shadow-sm transition-all group">
                            <div className="w-12 h-12 bg-blue-900 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-slate-900/20">
                                <ChartPie size={24} />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-xl font-bold text-slate-900">Presupuestos</h3>
                                <p className="text-slate-500 text-sm leading-relaxed">Define límites de gasto mensuales y recibe alertas automáticas antes de excederlos.</p>
                            </div>
                        </Card>
                    </div>
                </div>
            </section>

            {/* Highlights Section */}
            <section className="py-24 bg-white px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
                        <div className="space-y-8">
                            <h2 className="text-4xl font-black text-slate-900 tracking-tight">Lo que nos hace <span className="text-blue-600">diferentes.</span></h2>
                            <div className="space-y-6">
                                <div className="flex gap-4">
                                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                                        <CheckCircle2 size={16} />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-slate-900">Sincronización en Tiempo Real</h4>
                                        <p className="text-slate-500 text-sm">Cualquier gasto registrado por un miembro de la familia se refleja instantáneamente para todos.</p>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                                        <ShieldCheck size={16} />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-slate-900">Privacidad y Seguridad</h4>
                                        <p className="text-slate-500 text-sm">Tus datos están protegidos con encriptación de grado bancario. Solo tu familia tiene acceso.</p>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
                                        <TrendingUp size={16} />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-slate-900">Sin Limites de Cuentas</h4>
                                        <p className="text-slate-500 text-sm">Gestiona efectivo, tarjetas y bancos en un solo lugar sin restricciones.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="bg-slate-900 rounded-[32px] p-8 md:p-12 text-white space-y-6 shadow-2xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/20 blur-[100px] -z-0" />
                            <h3 className="text-2xl font-black relative z-10">Tu tranquilidad financiera comienza aquí.</h3>
                            <p className="text-slate-400 text-sm leading-relaxed relative z-10">
                                NiddoFlow no es solo una app de gastos. Es la herramienta que te ayuda a tener conversaciones honestas sobre el dinero en pareja y alcanzar metas juntos.
                            </p>
                            <Link href="/register" className="inline-flex items-center justify-center bg-white text-blue-900 hover:bg-slate-100 font-bold px-8 py-3 rounded-xl transition-colors relative z-10">
                                Empezar hoy
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-20 bg-white border-t border-slate-100 px-6">
                <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-10">
                    <div className="space-y-4">
                        <div className="flex items-center space-x-2">
                            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-black">
                                N
                            </div>
                            <Typography variant="h3" className="text-xl font-black tracking-tighter text-slate-900">NiddoFlow</Typography>
                        </div>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">© 2024 NiddoFlow. Gestión financiera familiar.</p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
