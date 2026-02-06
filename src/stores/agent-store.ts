import { create } from 'zustand';
import { apiClient } from '@/lib/api-client';
import type { Sacrifice } from '@/lib/agents/core/types';

export interface AgentOption {
    id: string;
    label: string;
    description?: string;
    warnings?: string[];
    sacrifices?: Sacrifice[];
    changes?: any[]; // Store the raw changes to apply
}

interface Message {
    id: string;
    role: 'user' | 'agent';
    content: string;
    options?: AgentOption[];
    timestamp: Date;
    isImpossible?: boolean;
}

interface AgentState {
    messages: Message[];
    isLoading: boolean;
    isApplying: boolean;

    // Actions
    sendMessage: (text: string) => Promise<void>;
    applyOption: (optionId: string) => Promise<any>;
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
            const data = await apiClient.post<any>('/api/intent', {
                message: text,
                source: 'chat',
                date: new Date().toISOString()
            });

            if (data.error) throw new Error(data.error);

            const agentMsg: Message = {
                id: crypto.randomUUID(),
                role: 'agent',
                content: data.summary || "Here are your options:",
                options: data.options, // Expecting backend to return structured options
                isImpossible: data.is_impossible,
                timestamp: new Date()
            };

            set(state => ({
                messages: [...state.messages, agentMsg],
                isLoading: false
            }));

        } catch (error) {
            console.error("Agent Error:", error);
            set(state => ({
                messages: [...state.messages, {
                    id: crypto.randomUUID(),
                    role: 'agent',
                    content: "Sorry, I couldn't process that request.",
                    timestamp: new Date()
                }],
                isLoading: false
            }));
        }
    },

    applyOption: async (optionId: string) => {
        set({ isApplying: true });

        // Find the option in the messages
        const option = get().messages
            .flatMap(m => m.options || [])
            .find(o => o.id === optionId);

        if (!option) {
            console.error("Option not found", optionId);
            set({ isApplying: false });
            return { success: false };
        }

        try {
            const data = await apiClient.post<any>('/api/calendar/apply-patch', {
                patch: option
            });

            if (data.error) throw new Error(data.error);

            // Add confirmation message
            const successMsg: Message = {
                id: crypto.randomUUID(),
                role: 'agent',
                content: `Done. Applied "${option.label}".`,
                timestamp: new Date()
            };

            set(state => ({
                messages: [...state.messages, successMsg],
                isApplying: false
            }));

            // Dispatch global refresh event for CalendarPage
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('calendar-refresh'));
            }

            return {
                success: true,
                patch_run_id: data.patch_run_id,
                undo_available: data.undo_available
            };

        } catch (error) {
            console.error("Apply Error:", error);
            set({ isApplying: false });
            return { success: false, error };
        }
    },

    clearMessages: () => set({ messages: [] })
}));
