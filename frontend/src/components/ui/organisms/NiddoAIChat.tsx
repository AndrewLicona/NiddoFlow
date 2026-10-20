'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/atoms/Button';
import { X, Bot, User, Loader2, Sparkles, MessageCircle, Send } from 'lucide-react';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

export const NiddoAIChat = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([
        { role: 'assistant', content: '¡Hola! Soy NiddoAI, tu asistente financiero inteligente. Pregúntame sobre tus saldos, presupuestos o gastos de la semana o el mes.' }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
        }
    }, [isOpen, messages]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || loading) return;

        const userMessage = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setLoading(true);

        try {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                setMessages(prev => [...prev, { role: 'assistant', content: 'Por favor inicia sesión para usar el chat.' }]);
                setLoading(false);
                return;
            }

            const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
            const res = await fetch(`${baseUrl}/api/chat/message`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                    message: userMessage,
                    history: messages.map(m => ({ role: m.role, content: m.content }))
                })
            });

            if (!res.ok) {
                throw new Error('Error en la respuesta del servidor');
            }

            const data = await res.json();
            setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
        } catch (error) {
            console.error('Chat error:', error);
            setMessages(prev => [...prev, { role: 'assistant', content: 'Lo siento, ocurrió un error al comunicarme con NiddoAI.' }]);
        } finally {
            setLoading(false);
        }
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
                                        Saldos y movimientos en tiempo real
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
