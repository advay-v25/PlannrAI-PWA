import { create } from 'zustand';
import { apiClient } from '@/lib/api-client';
import type { CoachOption, CoachResponse, CoachMode } from '@/types/coach-v4';

export interface Message {
    id: string;
    role: 'user' | 'agent';
    content: string; // The "summary" from V4

    // V4 Fields
    mode?: CoachMode;
    options?: CoachOption[];
    undoToken?: string | null;
    refusal?: { reason: string; question?: string | null };

    timestamp: Date;
    isImpossible?: boolean; // Legacy/Refusal helper
}

interface AgentState {
    messages: Message[];
    isLoading: boolean;
    isApplying: boolean;

    // Actions
    sendMessage: (text: string) => Promise<void>;
    applyOption: (optionId: string) => Promise<any>;
    undoAction: (token: string) => Promise<any>;
    clearMessages: () => void;
}

export const useAgentStore = create<AgentState>((set, get) => ({
    messages: [],
    isLoading: false,
    isApplying: false,

    sendMessage: async (text: string) => {
        const userMsg: Message = {
            id: crypto.randomUUID(),
            role: 'user',
            content: text,
            timestamp: new Date()
        };

        set(state => ({
            messages: [...state.messages, userMsg],
            isLoading: true
        }));

        try {
            // V4 Endpoint
            const data = await apiClient.post<{ response: CoachResponse }>('/api/coach', {
                message: text
            });

            if ((data as any).error) throw new Error((data as any).error);

            const response = data.response;

            const agentMsg: Message = {
                id: crypto.randomUUID(),
                role: 'agent',
                content: response.summary,
                mode: response.mode,
                options: response.options,
                undoToken: response.undo_token,
                refusal: response.refusal,
                isImpossible: response.mode === 'refusal',
                timestamp: new Date()
            };

            set(state => ({
                messages: [...state.messages, agentMsg],
                isLoading: false
            }));

            // Dispatch refresh if executed automatically
            if (response.mode === 'executed') {
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('calendar-refresh'));
                }
            }

        } catch (error) {
            console.error("Agent Error:", error);
            set(state => ({
                messages: [...state.messages, {
                    id: crypto.randomUUID(),
                    role: 'agent',
                    content: "I encountered a system error. Please try again.",
                    timestamp: new Date(),
                    mode: 'refusal'
                }],
                isLoading: false
            }));
        }
    },

    applyOption: async (optionId: string) => {
        set({ isApplying: true });

        // Find option and patch
        let selectedOption: CoachOption | undefined;
        const messages = get().messages;

        for (const m of messages) {
            if (m.options) {
                const found = m.options.find(o => o.id === optionId);
                if (found) {
                    selectedOption = found;
                    break;
                }
            }
        }

        if (!selectedOption) {
            console.error("Option not found", optionId);
            set({ isApplying: false });
            return { success: false };
        }

        try {
            const data = await apiClient.post<{ success: boolean; undo_token: string }>('/api/coach/apply', {
                patch: selectedOption.patch
            });

            // Add confirmation message
            const successMsg: Message = {
                id: crypto.randomUUID(),
                role: 'agent',
                content: `Applied: ${selectedOption.title}`,
                mode: 'executed',
                undoToken: data.undo_token,
                timestamp: new Date()
            };

            set(state => ({
                messages: [...state.messages, successMsg],
                isApplying: false
            }));

            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('calendar-refresh'));
            }

            return { success: true };

        } catch (error) {
            console.error("Apply Error:", error);
            set({ isApplying: false });
            return { success: false, error };
        }
    },

    undoAction: async (token: string) => {
        set({ isApplying: true });
        try {
            await apiClient.post('/api/coach/undo', { undo_token: token });

            // Add confirmation
            const undoMsg: Message = {
                id: crypto.randomUUID(),
                role: 'agent',
                content: "Reverted changes.",
                mode: 'executed',
                timestamp: new Date()
            };

            set(state => ({
                messages: [...state.messages, undoMsg],
                isApplying: false
            }));

            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('calendar-refresh'));
            }
        } catch (e) {
            console.error("Undo Error", e);
            set({ isApplying: false });
        }
    },

    clearMessages: () => set({ messages: [] })
}));
