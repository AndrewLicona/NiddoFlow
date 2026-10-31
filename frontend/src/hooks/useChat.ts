"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { chatApi, type ChatHistoryEntry } from "@/lib/api/chat.api";

/**
 * Historial del chat guardado en el servidor.
 *
 * Se carga solo cuando el panel está abierto (`enabled`), para no gastar una
 * llamada en cada render de la aplicación. Si el backend falla, la interfaz
 * sigue funcionando con la conversación en curso.
 */
export function useChatHistory(enabled: boolean = true) {
    return useQuery({
        queryKey: ["chat", "history"],
        queryFn: chatApi.getHistory,
        enabled,
        staleTime: 60_000,
        retry: 1,
    });
}

/**
 * Envía un mensaje a NiddoAI.
 *
 * La IA nunca escribe: devuelve `proposals` que el usuario confirma desde la
 * interfaz antes de que se cree la transacción.
 */
export function useSendChatMessage() {
    return useMutation({
        mutationFn: ({ message, history }: { message: string; history: ChatHistoryEntry[] }) =>
            chatApi.sendMessage(message, history),
    });
}
