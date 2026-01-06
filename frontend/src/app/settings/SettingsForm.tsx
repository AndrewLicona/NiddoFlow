'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { leaveFamily } from './actions'

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

    // Need router to redirect
    const router = useRouter()

    const handleLeave = async () => {
        if (confirmName !== family.name) return
        setIsLeaving(true)
        try {
            await leaveFamily()
            // Redirect manually after success
            router.push('/onboarding')
            router.refresh()
        } catch (error) {
            console.error(error)
            alert('Error al salir de la familia')
            setIsLeaving(false)
        }
    }

    return (
        <div className="space-y-6">
            <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                <div className="px-4 py-5 sm:px-6">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">Información del Niddo</h3>
                    <p className="mt-1 max-w-2xl text-sm text-gray-500">Detalles de tu familia actual.</p>
                </div>
                <div className="border-t border-gray-200">
                    <dl>
                        <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                            <dt className="text-sm font-medium text-gray-500">Nombre</dt>
                            <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{family.name}</dd>
                        </div>
                        <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                            <dt className="text-sm font-medium text-gray-500">Invitación</dt>
                            <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                                <div className="flex items-center space-x-2">
                                    <span className="font-mono font-bold text-lg bg-gray-100 px-2 py-1 rounded border border-gray-300">
                                        {family.invite_code || '---'}
                                    </span>
                                    {family.invite_code && (
                                        <button
                                            onClick={() => {
                                                const url = `${window.location.origin}/invite/${family.invite_code}`
                                                navigator.clipboard.writeText(url)
                                                setHasCopied(true)
                                                setTimeout(() => setHasCopied(false), 2000)
                                            }}
                                            className={`inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-full shadow-sm text-white focus:outline-none transition-all duration-200 ${hasCopied ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                                        >
                                            {hasCopied ? '¡Copiado! ✅' : 'Copiar Link 🔗'}
                                        </button>
                                    )}
                                </div>
                                <p className="mt-2 text-xs text-gray-500">
                                    Comparte este enlace para que se unan directamente.
                                </p>
                            </dd>
                        </div>
                    </dl>
                </div>
            </div>

            <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
                    <div>
                        <h3 className="text-lg leading-6 font-medium text-gray-900">Integrantes del Niddo</h3>
                        <p className="mt-1 max-w-2xl text-sm text-gray-500">Personas que forman parte de tu familia.</p>
                    </div>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {members.length} {members.length === 1 ? 'Integrante' : 'Integrantes'}
                    </span>
                </div>
                <div className="border-t border-gray-200">
                    <ul className="divide-y divide-gray-200">
                        {members.map((member) => (
                            <li key={member.id} className="px-4 py-4 sm:px-6 hover:bg-gray-50 transition-colors">
                                <div className="flex items-center space-x-4">
                                    <div className="flex-shrink-0">
                                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
                                            {(member.full_name || member.email || '?')[0].toUpperCase()}
                                        </div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-gray-900 truncate">
                                            {member.full_name || 'Sin nombre'}
                                        </p>
                                        <p className="text-sm text-gray-500 truncate">
                                            {member.email}
                                        </p>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            <div className="bg-red-50 shadow sm:rounded-lg border border-red-200">
                <div className="px-4 py-5 sm:p-6">
                    <h3 className="text-lg leading-6 font-medium text-red-900">Zona de Peligro</h3>
                    <div className="mt-2 max-w-xl text-sm text-red-500">
                        <p>Si sales de esta familia, perderás acceso a las cuentas compartidas y deberás unirte o crear una nueva familia.</p>
                    </div>
                    <div className="mt-5">
                        <button
                            type="button"
                            onClick={() => setIsLeaveModalOpen(true)}
                            className="inline-flex items-center justify-center px-4 py-2 border border-transparent font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:text-sm"
                        >
                            Salir de la Familia
                        </button>
                    </div>
                </div>
            </div>

            {/* Modal */}
            {isLeaveModalOpen && (
                <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
                    <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">

                        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={() => setIsLeaveModalOpen(false)}></div>

                        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

                        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full relative z-50">
                            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                                <div className="sm:flex sm:items-start">
                                    <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                                        <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                    </div>
                                    <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                                        <h3 className="text-lg leading-6 font-medium text-gray-900" id="modal-title">
                                            Confirmar Salida
                                        </h3>
                                        <div className="mt-4">
                                            <p className="text-base text-gray-700 font-medium mb-2">
                                                Escribe el nombre exacto de la familia para confirmar:
                                            </p>
                                            <div className="p-3 bg-gray-100 rounded text-center text-lg font-bold text-gray-900 mb-4 select-none border border-gray-300">
                                                {family.name}
                                            </div>

                                            <label className="block text-sm font-bold text-gray-700 mb-1">Escribir nombre aquí:</label>
                                            <input
                                                type="text"
                                                className="shadow-sm focus:ring-red-500 focus:border-red-500 block w-full text-lg border-2 border-gray-400 rounded-md p-2 text-gray-900 placeholder-gray-400"
                                                placeholder={family.name}
                                                value={confirmName}
                                                onChange={(e) => setConfirmName(e.target.value)}
                                                onPaste={(e) => {
                                                    e.preventDefault()
                                                    alert('A ver, a ver... ¡Nada de copiar y pegar! Escríbelo por favor. 😉')
                                                }}
                                                autoComplete="off"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                                <button
                                    type="button"
                                    onClick={handleLeave}
                                    disabled={confirmName !== family.name || isLeaving}
                                    className={`w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm ${(confirmName !== family.name || isLeaving) ? 'opacity-50 cursor-not-allowed' : ''
                                        }`}
                                >
                                    {isLeaving ? 'Saliendo...' : 'Sí, salir de la familia'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsLeaveModalOpen(false)
                                        setConfirmName('')
                                    }}
                                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
