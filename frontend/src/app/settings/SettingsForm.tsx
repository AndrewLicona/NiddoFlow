'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { leaveFamily } from './actions'
import { Typography } from '@/components/ui/atoms/Typography'
import { Button } from '@/components/ui/atoms/Button'
import { Card } from '@/components/ui/molecules/Card'
import { InputField } from '@/components/ui/molecules/InputField'
import { Home, Link as LinkIcon, Copy, Check, Users, LogOut, AlertTriangle } from 'lucide-react'

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
                        <div className="p-3 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-foreground/[0.05]">
                            <Home size={24} className="text-blue-500" />
                        </div>
                    </div>

                    <div className="bg-blue-500/[0.03] p-5 rounded-2xl border border-blue-500/10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="flex items-center space-x-4">
                            <div className="p-3 bg-blue-500/10 rounded-2xl">
                                <LinkIcon size={20} className="text-blue-600" />
                            </div>
                            <div>
                                <Typography variant="small" className="text-blue-500/60 font-black uppercase tracking-widest text-[10px]">Código de Invitación</Typography>
                                <Typography variant="body" className="font-mono text-xl font-black text-blue-700 mt-0.5 tracking-wider">
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
                                className="md:w-auto w-full shadow-lg shadow-blue-500/10"
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

            {/* Premium Modal for Leaving */}
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
        </div>
    )
}
