import { fetchWithAuth } from "./client";

export type ChatRole = 'user' | 'assistant';

export interface ChatHistoryEntry {
    role: ChatRole;
    content: string;
}

export interface ChatProposalPayload {
    description: string;
    amount: number;
    type: 'income' | 'expense' | 'transfer';
    category_id?: string | null;
    account_id: string;
    date?: string;
}

export interface ChatProposal {
    type: 'transaction';
    label: string;
    payload: ChatProposalPayload;
}

export interface ChatReply {
    reply: string;
    proposals?: ChatProposal[];
}

/**
 * API del chat con NiddoAI.
 *
 * El backend responde con `reply` y, opcionalmente, `proposals`: la IA
 * NUNCA escribe, propone. El usuario confirma en la interfaz.
 */
export const chatApi = {
    /** Historial guardado en el servidor, para que la IA recuerde sesiones anteriores. */
    getHistory: async (): Promise<ChatHistoryEntry[]> => {
        const data = await fetchWithAuth("/api/chat/history");
        return Array.isArray(data) ? data : [];
    },

    /** Envía un mensaje y devuelve la respuesta con sus propuestas. */
    sendMessage: async (message: string, history: ChatHistoryEntry[]): Promise<ChatReply> => {
        return fetchWithAuth("/api/chat/message", {
            method: "POST",
            body: JSON.stringify({ message, history }),
        });
    },
};
