'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { leaveFamily } from './actions'
import { Typography } from '@/components/ui/atoms/Typography'
import { Button } from '@/components/ui/atoms/Button'
import { Card } from '@/components/ui/molecules/Card'
import { InputField } from '@/components/ui/molecules/InputField'
import { Home, Link as LinkIcon, Copy, Check, Users, LogOut, AlertTriangle, Palette, Moon, Sun, Monitor, Leaf, Droplets, Sunset } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useColorPalette } from '@/components/providers/ColorPaletteProvider'

type FamilyData = {
    id: string
    name: string
    invite_code: string | null
}

type Member = {
    id: string
    full_name: string | null
    email: string
}

export default function SettingsForm({ family, members }: { family: FamilyData, members: Member[] }) {
    const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false)
    const [confirmName, setConfirmName] = useState('')
    const [isLeaving, setIsLeaving] = useState(false)
    const [hasCopied, setHasCopied] = useState(false)
    const [activeTab, setActiveTab] = useState<'general' | 'appearance'>('general')
    const { theme, setTheme } = useTheme()
    const { palette, setPalette } = useColorPalette()

    const router = useRouter()

    const handleLeave = async () => {
        if (confirmName !== family.name) return
        setIsLeaving(true)
        try {
            await leaveFamily()
            router.push('/onboarding')
            router.refresh()
        } catch (error) {
            console.error(error)
            alert('Error al salir de la familia')
            setIsLeaving(false)
        }
    }

    return (
        <div className="space-y-8 pb-32">
            {/* Tabs Navigation */}
            <div className="flex p-1 bg-foreground/[0.03] rounded-2xl w-full md:w-fit">
                <button
                    onClick={() => setActiveTab('general')}
                    className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${activeTab === 'general' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    General
                </button>
                <button
                    onClick={() => setActiveTab('appearance')}
                    className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${activeTab === 'appearance' ? 'bg-card text-pink-600 shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    Apariencia
                </button>
            </div>

            {activeTab === 'general' ? (
                <div className="space-y-8 animate-in fade-in slide-in-from-left-4 duration-300">
                    {/* Family Info */}
                    <Card variant="elevated" className="overflow-hidden">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <Typography variant="h3">Información del Niddo</Typography>
                                <Typography variant="muted">Detalles de tu hogar y acceso familiar.</Typography>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="bg-foreground/[0.01] p-5 rounded-2xl border border-foreground/[0.03] flex justify-between items-center transition-colors hover:bg-foreground/[0.02]">
                                <div>
                                    <Typography variant="small" className="opacity-40 font-black uppercase tracking-widest text-[10px] mb-1">Nombre del Niddo</Typography>
                                    <Typography variant="h3" className="text-foreground/90">{family.name}</Typography>
                                </div>
                                <div className="p-3 bg-card rounded-2xl shadow-sm border border-foreground/[0.05]">
                                    <Home size={24} className="text-primary" />
                                </div>
                            </div>

                            <div className="bg-primary/5 p-5 rounded-2xl border border-primary/10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                                <div className="flex items-center space-x-4">
                                    <div className="p-3 bg-primary/10 rounded-2xl">
                                        <LinkIcon size={20} className="text-primary" />
                                    </div>
                                    <div>
                                        <Typography variant="small" className="text-primary/60 font-black uppercase tracking-widest text-[10px]">Código de Invitación</Typography>
                                        <Typography variant="body" className="font-mono text-xl font-black text-primary mt-0.5 tracking-wider">
                                            {family.invite_code || '---'}
                                        </Typography>
                                    </div>
                                </div>
                                {family.invite_code && (
                                    <Button
                                        size="sm"
                                        variant={hasCopied ? 'success' : 'primary'}
                                        onClick={() => {
                                            const url = `${window.location.origin}/invite/${family.invite_code}`
                                            navigator.clipboard.writeText(url)
                                            setHasCopied(true)
                                            setTimeout(() => setHasCopied(false), 2000)
                                        }}
                                        className="md:w-auto w-full shadow-lg shadow-primary/10"
                                    >
                                        {hasCopied ? (
                                            <><Check size={16} className="mr-2" /> ¡Copiado!</>
                                        ) : (
                                            <><Copy size={16} className="mr-2" /> Copiar Invitación</>
                                        )}
                                    </Button>
                                )}
                            </div>
                        </div>
                    </Card>

                    {/* Members List */}
                    <Card variant="elevated">
                        <div className="flex justify-between items-center mb-8">
                            <div className="flex items-center space-x-3">
                                <div className="p-2 bg-indigo-500/10 rounded-xl">
                                    <Users size={20} className="text-indigo-600" />
                                </div>
                                <div>
                                    <Typography variant="h3">Integrantes</Typography>
                                    <Typography variant="muted">{members.length} personas forman parte de este Niddo.</Typography>
                                </div>
                            </div>
                        </div>

                        <ul className="space-y-4">
                            {members.map((member) => (
                                <li key={member.id} className="group">
                                    <div className="flex items-center p-4 rounded-2xl hover:bg-foreground/[0.02] transition-all border border-transparent border-foreground/[0.03] group-hover:border-foreground/[0.08]">
                                        <div className="flex-shrink-0">
                                            <div className="h-14 w-14 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-600 flex items-center justify-center text-white font-black text-xl shadow-md group-hover:scale-105 transition-transform duration-300">
                                                {(member.full_name || member.email || '?')[0].toUpperCase()}
                                            </div>
                                        </div>
                                        <div className="ml-5 flex-1">
                                            <Typography variant="body" className="font-black text-foreground/80">
                                                {member.full_name || 'Sin nombre configurado'}
                                            </Typography>
                                            <Typography variant="muted" className="text-xs mt-0.5 font-medium opacity-60">
                                                {member.email}
                                            </Typography>
                                        </div>
                                        <div className="px-3 py-1 bg-foreground/[0.05] text-foreground/40 rounded-xl text-[10px] font-black tracking-widest uppercase opacity-0 group-hover:opacity-100 transition-opacity">
                                            Miembro
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </Card>

                    {/* Danger Zone */}
                    <Card variant="elevated" className="border-rose-500/10 bg-rose-500/[0.01]">
                        <div className="flex items-center space-x-3 mb-4">
                            <div className="p-2 bg-rose-500/10 rounded-xl">
                                <AlertTriangle size={20} className="text-rose-500" />
                            </div>
                            <Typography variant="h3" className="text-rose-600">Zona Peligrosa</Typography>
                        </div>
                        <Typography variant="body" className="text-rose-900/40 mb-8 text-sm leading-relaxed max-w-2xl">
                            Al abandonar este Niddo, perderás acceso instantáneo a todas las finanzas compartidas. Esta acción requiere confirmación manual para evitar accidentes.
                        </Typography>
                        <Button
                            variant="outline"
                            onClick={() => setIsLeaveModalOpen(true)}
                            className="border-rose-500/20 text-rose-600 hover:bg-rose-500 hover:text-white transition-all w-full md:w-auto"
                        >
                            <LogOut size={16} className="mr-2" />
                            Abandonar Niddo
                        </Button>
                    </Card>
                </div>
            ) : (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                    <Card variant="elevated">
                        <div className="flex justify-between items-center mb-6">
                            <div className="flex items-center space-x-3">
                                <div className="p-2 bg-pink-500/10 rounded-xl">
                                    <Palette size={20} className="text-pink-600" />
                                </div>
                                <div>
                                    <Typography variant="h3">Apariencia</Typography>
                                    <Typography variant="muted">Personaliza la experiencia visual de Niddo.</Typography>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-8">

                            {/* Section 1: System Mode (Light/Dark) */}
                            <div>
                                <div className="mb-4">
                                    <Typography variant="body" className="font-bold text-base mb-1">Modo del Sistema</Typography>
                                    <Typography variant="muted" className="text-sm">Elige si prefieres una interfaz clara u oscura.</Typography>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <button
                                        onClick={() => setTheme('light')}
                                        className={`group relative flex flex-col items-center p-6 rounded-3xl border transition-all duration-300 ${theme === 'light' ? 'bg-card border-primary shadow-xl shadow-primary/10 scale-[1.02]' : 'bg-card/50 border-transparent hover:bg-card hover:border-foreground/10'}`}
                                    >
                                        <Sun size={32} className={`mb-4 ${theme === 'light' ? 'text-primary' : 'text-muted-foreground'}`} />
                                        <span className={`font-bold ${theme === 'light' ? 'text-primary' : 'text-muted-foreground'}`}>Claro</span>
                                    </button>

                                    <button
                                        onClick={() => setTheme('dark')}
                                        className={`group relative flex flex-col items-center p-6 rounded-3xl border transition-all duration-300 ${theme === 'dark' ? 'bg-card border-primary shadow-xl shadow-primary/10 scale-[1.02]' : 'bg-card/50 border-transparent hover:bg-card hover:border-foreground/10'}`}
                                    >
                                        <Moon size={32} className={`mb-4 ${theme === 'dark' ? 'text-primary' : 'text-muted-foreground'}`} />
                                        <span className={`font-bold ${theme === 'dark' ? 'text-primary' : 'text-muted-foreground'}`}>Oscuro</span>
                                    </button>

                                    <button
                                        onClick={() => setTheme('system')}
                                        className={`group relative flex flex-col items-center p-6 rounded-3xl border transition-all duration-300 ${theme === 'system' ? 'bg-card border-primary shadow-xl shadow-primary/10 scale-[1.02]' : 'bg-card/50 border-transparent hover:bg-card hover:border-foreground/10'}`}
                                    >
                                        <Monitor size={32} className={`mb-4 ${theme === 'system' ? 'text-primary' : 'text-muted-foreground'}`} />
                                        <span className={`font-bold ${theme === 'system' ? 'text-primary' : 'text-muted-foreground'}`}>Automático</span>
                                    </button>
                                </div>
                            </div>

                            {/* Section 2: Color Palette */}
                            <div>
                                <div className="mb-4">
                                    <Typography variant="body" className="font-bold text-base mb-1">Paleta de Colores</Typography>
                                    <Typography variant="muted" className="text-sm">Personaliza el acento de color de la aplicación.</Typography>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

                                    {/* Default Palette */}
                                    <button
                                        onClick={() => setPalette('default')}
                                        className={`group relative flex flex-col items-center p-6 rounded-3xl border transition-all duration-300 ${palette === 'default' ? 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-500 shadow-xl shadow-indigo-500/10 scale-[1.02]' : 'bg-card/50 border-transparent hover:bg-card hover:border-foreground/10'}`}
                                    >
                                        <div className="w-12 h-12 rounded-full bg-indigo-600 mb-3 shadow-lg flex items-center justify-center">
                                            <Palette size={20} className="text-white" />
                                        </div>
                                        <span className={`font-bold ${palette === 'default' ? 'text-indigo-700 dark:text-indigo-300' : 'text-muted-foreground'}`}>Original</span>
                                    </button>

                                    {/* Sunset Palette */}
                                    <button
                                        onClick={() => setPalette('sunset')}
                                        className={`group relative flex flex-col items-center p-6 rounded-3xl border transition-all duration-300 ${palette === 'sunset' ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-500 shadow-xl shadow-rose-500/10 scale-[1.02]' : 'bg-card/50 border-transparent hover:bg-card hover:border-foreground/10'}`}
                                    >
                                        <div className="w-12 h-12 rounded-full bg-rose-600 mb-3 shadow-lg flex items-center justify-center">
                                            <Sunset size={20} className="text-white" />
                                        </div>
                                        <span className={`font-bold ${palette === 'sunset' ? 'text-rose-700 dark:text-rose-300' : 'text-muted-foreground'}`}>Sunset</span>
                                    </button>

                                    {/* Forest Palette */}
                                    <button
                                        onClick={() => setPalette('forest')}
                                        className={`group relative flex flex-col items-center p-6 rounded-3xl border transition-all duration-300 ${palette === 'forest' ? 'bg-green-50 dark:bg-green-950/30 border-green-600 shadow-xl shadow-green-600/10 scale-[1.02]' : 'bg-card/50 border-transparent hover:bg-card hover:border-foreground/10'}`}
                                    >
                                        <div className="w-12 h-12 rounded-full bg-green-600 mb-3 shadow-lg flex items-center justify-center">
                                            <Leaf size={20} className="text-white" />
                                        </div>
                                        <span className={`font-bold ${palette === 'forest' ? 'text-green-700 dark:text-green-300' : 'text-muted-foreground'}`}>Forest</span>
                                    </button>

                                    {/* Ocean Palette */}
                                    <button
                                        onClick={() => setPalette('ocean')}
                                        className={`group relative flex flex-col items-center p-6 rounded-3xl border transition-all duration-300 ${palette === 'ocean' ? 'bg-sky-50 dark:bg-sky-950/30 border-sky-600 shadow-xl shadow-sky-600/10 scale-[1.02]' : 'bg-card/50 border-transparent hover:bg-card hover:border-foreground/10'}`}
                                    >
                                        <div className="w-12 h-12 rounded-full bg-sky-600 mb-3 shadow-lg flex items-center justify-center">
                                            <Droplets size={20} className="text-white" />
                                        </div>
                                        <span className={`font-bold ${palette === 'ocean' ? 'text-sky-700 dark:text-sky-300' : 'text-muted-foreground'}`}>Ocean</span>
                                    </button>

                                </div>
                            </div>
                        </div>
                    </Card>
                </div>
            )}


            {/* Leave Modal */}
            {isLeaveModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-500">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setIsLeaveModalOpen(false)}></div>

                    <Card variant="glass" className="relative w-full max-w-md shadow-2xl border-white/5 dark:border-white/10 p-10 transform animate-in zoom-in-95 duration-300 rounded-[32px]">
                        <div className="flex flex-col items-center text-center space-y-6 mb-10">
                            <div className="h-20 w-20 bg-rose-500/10 text-rose-600 rounded-[28px] flex items-center justify-center shadow-inner border border-rose-500/20">
                                <AlertTriangle size={40} />
                            </div>
                            <div className="space-y-2">
                                <Typography variant="h2" className="text-foreground tracking-tight">¿Estás seguro?</Typography>
                                <Typography variant="body" className="text-foreground/40 text-sm">
                                    Confirma que deseas salir de <b>{family.name}</b> escribiendo el nombre abajo.
                                </Typography>
                            </div>
                        </div>

                        <div className="space-y-8">
                            <div className="p-4 bg-foreground/[0.03] rounded-2xl border border-foreground/[0.05] text-center font-black tracking-widest text-foreground/20 select-none text-sm uppercase">
                                {family.name}
                            </div>

                            <InputField
                                label="Validación de Seguridad"
                                placeholder={`Escribe exactamente "${family.name}"`}
                                value={confirmName}
                                onChange={(e) => setConfirmName(e.target.value)}
                                onPaste={(e) => {
                                    e.preventDefault()
                                    alert('¡Escríbelo manualmente! Es por tu seguridad 🛡️')
                                }}
                                autoComplete="off"
                                className="text-center"
                            />

                            <div className="flex flex-col gap-4 pt-4">
                                <Button
                                    variant="danger"
                                    onClick={handleLeave}
                                    disabled={confirmName !== family.name || isLeaving}
                                    className="w-full py-5 text-lg font-black tracking-wide rounded-2xl shadow-xl shadow-rose-500/20"
                                >
                                    {isLeaving ? 'Saliendo...' : 'Confirmar y Abandonar'}
                                </Button>
                                <Button
                                    variant="ghost"
                                    onClick={() => {
                                        setIsLeaveModalOpen(false)
                                        setConfirmName('')
                                    }}
                                    className="w-full text-foreground/40 hover:text-foreground font-bold"
                                >
                                    No, cancelar
                                </Button>
                            </div>
                        </div>
                    </Card>
                </div>
            )}
        </div >
    )
}
