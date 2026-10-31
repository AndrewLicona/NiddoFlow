'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useChatHistory, useSendChatMessage } from '@/hooks/useChat';
import { X, Bot, User, Loader2, Sparkles, Send, Check, Trash2 } from 'lucide-react';
import { useTransactions } from '@/hooks/useTransactions';
import { formatCurrency } from '@/utils/format';

interface Proposal {
    type: 'transaction';
    label: string;
    payload: {
        description: string;
        amount: number;
        type: 'income' | 'expense' | 'transfer';
        category_id?: string | null;
        account_id: string;
        date?: string;
    };
}

interface Message {
    role: 'user' | 'assistant';
    content: string;
    proposals?: Proposal[];
    proposalState?: Record<number, 'pending' | 'confirmed' | 'dismissed'>;
}

const GREETING: Message = {
    role: 'assistant',
    content: '¡Hola! Soy NiddoAI, tu asistente financiero inteligente. Pregúntame sobre tus saldos, presupuestos o gastos de la semana o el mes.',
};

export const NiddoAIChat = () => {
    const [isOpen, setIsOpen] = useState(false);
    // Mensajes de la sesión en curso. El historial guardado en el servidor se
    // combina con ellos al renderizar, sin copiarlo a un estado aparte.
    const [localMessages, setLocalMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const { createTransaction } = useTransactions();

    // El historial se pide al backend solo cuando el panel está abierto y el
    // usuario todavía no ha escrito en esta sesión.
    const { data: historyData, isLoading: loadingHistory } = useChatHistory(isOpen && localMessages.length === 0);
    const sendMessage = useSendChatMessage();
    const loading = sendMessage.isPending;

    /**
     * Historial guardado en el servidor, normalizado al formato de la UI.
     * Se deriva durante el render en vez de copiarse a un estado: así no hace
     * falta un efecto para sincronizar dos fuentes de verdad.
     */
    const historyMessages = useMemo<Message[]>(
        () =>
            (historyData ?? [])
                .filter((h) => h.role === 'user' || h.role === 'assistant')
                .map((h) => ({ role: h.role, content: h.content || '' })),
        [historyData]
    );

    /**
     * Lo que se muestra: historial del servidor + mensajes de esta sesión.
     * Si no hay historial todavía, se muestra el saludo inicial.
     */
    const messages = useMemo<Message[]>(() => {
        if (historyMessages.length > 0) return [...historyMessages, ...localMessages];
        return [GREETING, ...localMessages];
    }, [historyMessages, localMessages]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
        }
    }, [isOpen, messages]);

    const handleSend = (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || loading) return;

        const userMessage = input.trim();
        setInput('');
        setLocalMessages(prev => [...prev, { role: 'user', content: userMessage }]);

        const historyPayload = messages.map(m => ({ role: m.role, content: m.content }));

        sendMessage.mutate(
            { message: userMessage, history: historyPayload },
            {
                onSuccess: (data) => {
                    const proposals: Proposal[] = Array.isArray(data?.proposals) ? data.proposals : [];
                    setLocalMessages(prev => [...prev, {
                        role: 'assistant',
                        content: data?.reply ?? '',
                        proposals: proposals.length ? proposals : undefined,
                        proposalState: proposals.length
                            ? Object.fromEntries(proposals.map((_, i) => [i, 'pending' as const]))
                            : undefined,
                    }]);
                },
                onError: (error: any) => {
                    console.error('Chat error:', error);
                    const detail = String(error?.message || '');
                    const sinSesion = /401|credential|token|unauth/i.test(detail);
                    setLocalMessages(prev => [...prev, {
                        role: 'assistant',
                        content: sinSesion
                            ? 'Por favor inicia sesión para usar el chat.'
                            : 'Lo siento, ocurrió un error al comunicarme con NiddoAI.'
                    }]);
                },
            }
        );
    };

    /**
     * Confirma una propuesta de la IA. La IA NUNCA escribe directamente:
     * propone, y el usuario confirma aquí.
     *
     * `messageIndex` es el índice dentro de la lista mostrada (historial +
     * sesión). Para actualizar el estado local se descuenta el historial.
     */
    const confirmProposal = async (messageIndex: number, proposalIndex: number, proposal: Proposal) => {
        const localIndex = messageIndex - historyMessages.length;

        setLocalMessages(prev => prev.map((m, i) => {
            if (i !== localIndex || !m.proposalState) return m;
            return {
                ...m,
                proposalState: { ...m.proposalState, [proposalIndex]: 'confirmed' as const },
            };
        }));

        try {
            await createTransaction.mutateAsync({
                description: proposal.payload.description,
                amount: proposal.payload.amount,
                type: proposal.payload.type,
                category_id: proposal.payload.category_id || null,
                account_id: proposal.payload.account_id,
                date: proposal.payload.date || new Date().toISOString(),
                source: 'manual',
            });
        } catch (error) {
            console.error('No se pudo registrar la propuesta:', error);
            setLocalMessages(prev => prev.map((m, i) => {
                if (i !== localIndex || !m.proposalState) return m;
                return {
                    ...m,
                    proposalState: { ...m.proposalState, [proposalIndex]: 'pending' as const },
                };
            }));
        }
    };

    const dismissProposal = (messageIndex: number, proposalIndex: number) => {
        const localIndex = messageIndex - historyMessages.length;
        setLocalMessages(prev => prev.map((m, i) => {
            if (i !== localIndex || !m.proposalState) return m;
            return {
                ...m,
                proposalState: { ...m.proposalState, [proposalIndex]: 'dismissed' as const },
            };
        }));
    };

    // Helper to format bot responses nicely (stripping raw markdown asterisks and handling line breaks)
    const renderFormattedContent = (content: string) => {
        // Replace bold markdown **text** with styled spans and ensure clean line breaks
        const parts = content.split('\n');
        return parts.map((line, lineIdx) => {
            // Check if it's a bullet or header line
            const isBullet = line.trim().startsWith('-') || line.trim().startsWith('*');
            const cleanLine = line.replace(/^[*\-]\s*/, '');

            // Parse bold sections
            const segments = cleanLine.split(/(\*\*.*?\*\*)/g);

            return (
                <div key={lineIdx} className={`${isBullet ? 'pl-4 my-1 flex items-start gap-2' : 'my-1.5'}`}>
                    {isBullet && <span className="text-primary mt-1">•</span>}
                    <span>
                        {segments.map((seg, segIdx) => {
                            if (seg.startsWith('**') && seg.endsWith('**')) {
                                const boldText = seg.slice(2, -2);
                                return <strong key={segIdx} className="font-black text-primary">{boldText}</strong>;
                            }
                            return seg;
                        })}
                    </span>
                </div>
            );
        });
    };

    return (
        <>
            {/* Floating Action Button - Accessible from anywhere in the app */}
            <div className="fixed bottom-24 md:bottom-6 right-4 md:right-6 z-50">
                <button
                    onClick={() => setIsOpen(true)}
                    className="flex items-center gap-2.5 bg-gradient-to-r from-primary to-indigo-600 text-white px-5 py-4 rounded-full shadow-[0_10px_35px_rgba(var(--primary),0.4)] hover:scale-105 active:scale-95 transition-all duration-300 font-bold text-sm cursor-pointer group"
                    title="Abrir Asistente NiddoAI"
                >
                    <Sparkles size={22} className="animate-pulse text-yellow-300 group-hover:rotate-12 transition-transform" />
                    <span className="hidden sm:inline">NiddoAI Asistente</span>
                    <span className="sm:hidden">IA</span>
                </button>
            </div>

            {/* Chat Modal / Fullscreen on Mobile */}
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="bg-card border border-foreground/[0.08] shadow-[0_20px_60px_rgba(0,0,0,0.3)] w-full h-full sm:h-[600px] sm:max-w-[460px] sm:rounded-[32px] flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-300">
                        {/* Header */}
                        <div className="bg-primary/10 px-6 py-4 border-b border-foreground/[0.06] flex items-center justify-between flex-shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-11 h-11 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/30">
                                    <Bot size={24} />
                                </div>
                                <div>
                                    <h3 className="font-black text-base text-foreground tracking-tight">NiddoAI Asistente</h3>
                                    <p className="text-[11px] text-emerald-500 font-bold flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                        {loadingHistory ? 'Recuperando tu historial…' : 'Saldos y movimientos en tiempo real'}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-2.5 rounded-2xl text-foreground/50 hover:text-foreground hover:bg-foreground/[0.06] transition-colors cursor-pointer"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Messages Scroll Area */}
                        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-foreground/[0.01]">
                            {messages.map((m, idx) => (
                                <div
                                    key={idx}
                                    className={`flex items-start gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
                                >
                                    <div className={`w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm ${
                                        m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-primary/20 text-primary'
                                    }`}>
                                        {m.role === 'user' ? <User size={18} /> : <Bot size={18} />}
                                    </div>
                                    <div className={`max-w-[82%] px-5 py-3.5 rounded-2xl text-xs sm:text-sm leading-relaxed ${
                                        m.role === 'user'
                                            ? 'bg-indigo-600 text-white rounded-tr-none shadow-md shadow-indigo-600/20'
                                            : 'bg-card border border-foreground/[0.08] text-foreground rounded-tl-none shadow-sm'
                                    }`}>
                                        {m.role === 'assistant' ? renderFormattedContent(m.content) : m.content}

                                        {/* Propuestas de la IA: nunca escribe sola, el usuario confirma */}
                                        {m.proposals && m.proposals.length > 0 && (
                                            <div className="mt-3 space-y-2 border-t border-foreground/[0.06] pt-3">
                                                {m.proposals.map((proposal, pIdx) => {
                                                    const state = m.proposalState?.[pIdx] ?? 'pending';
                                                    return (
                                                        <div
                                                            key={pIdx}
                                                            className={`rounded-xl border p-3 text-xs ${
                                                                state === 'confirmed'
                                                                    ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-500/30'
                                                                    : state === 'dismissed'
                                                                        ? 'border-foreground/10 opacity-50'
                                                                        : 'border-primary/30 bg-primary/[0.06]'
                                                            }`}
                                                        >
                                                            <div className="flex items-start gap-2 mb-2">
                                                                <Sparkles size={13} className="mt-0.5 shrink-0 text-primary" />
                                                                <div className="min-w-0">
                                                                    <div className="font-bold leading-snug">{proposal.label}</div>
                                                                    <div className="opacity-60 text-[10px] mt-0.5">
                                                                        {proposal.payload.description} · {formatCurrency(proposal.payload.amount)}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {state === 'pending' ? (
                                                                <div className="flex gap-2">
                                                                    <button
                                                                        onClick={() => confirmProposal(idx, pIdx, proposal)}
                                                                        className="flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 font-bold text-[10px] transition-colors cursor-pointer"
                                                                    >
                                                                        <Check size={12} /> Confirmar
                                                                    </button>
                                                                    <button
                                                                        onClick={() => dismissProposal(idx, pIdx)}
                                                                        className="flex items-center gap-1 rounded-lg bg-foreground/[0.06] hover:bg-foreground/10 px-2.5 py-1.5 font-bold text-[10px] transition-colors cursor-pointer"
                                                                    >
                                                                        <Trash2 size={12} /> Descartar
                                                                    </button>
                                                                </div>
                                                            ) : state === 'confirmed' ? (
                                        <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                                                                    <Check size={12} /> Registrado
                                                                </div>
                                                            ) : (
                                                                <div className="text-[10px] font-bold opacity-50">Descartado</div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {loading && (
                                <div className="flex items-start gap-3">
                                    <div className="w-9 h-9 rounded-2xl bg-primary/20 text-primary flex items-center justify-center flex-shrink-0 shadow-sm">
                                        <Bot size={18} />
                                    </div>
                                    <div className="bg-card border border-foreground/[0.08] px-5 py-3.5 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-3">
                                        <Loader2 size={16} className="animate-spin text-primary" />
                                        <span className="text-xs font-bold text-foreground/50">Analizando tus finanzas...</span>
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Form */}
                        <form onSubmit={handleSend} className="p-4 bg-card border-t border-foreground/[0.06] flex items-center gap-3 flex-shrink-0">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Pregunta sobre tus gastos o presupuesto..."
                                className="flex-1 bg-foreground/[0.03] border border-foreground/[0.08] rounded-2xl px-5 py-3.5 text-xs sm:text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
                            />
                            <button
                                type="submit"
                                disabled={loading || !input.trim()}
                                className="bg-primary text-primary-foreground p-3.5 rounded-2xl hover:opacity-90 disabled:opacity-40 transition-all shadow-md shadow-primary/20 flex items-center justify-center cursor-pointer"
                            >
                                <Send size={18} />
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
};
