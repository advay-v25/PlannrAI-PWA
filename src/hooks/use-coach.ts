
import { create } from 'zustand';
import { apiClient } from '@/lib/api-client';
import { CoachResponseSchema } from '@/lib/ai/schemas';
import { z } from 'zod';

// Infer types from Schema
export type CoachResponse = z.infer<typeof CoachResponseSchema>;
export type CoachOption = NonNullable<CoachResponse['options']>[number];

export interface CoachMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string; // Summary or text
    mode?: CoachResponse['mode'];
    options?: CoachOption[];
    isApplying?: boolean;
    appliedOptionId?: string;
}

interface CoachState {
    messages: CoachMessage[];
    isLoading: boolean;

    // Actions
    sendMessage: (text: string) => Promise<void>;
    applyOption: (messageId: string, optionId: string) => Promise<void>;
    loadHistory: () => Promise<void>;
}

export const useCoach = create<CoachState>((set, get) => ({
    messages: [],
    isLoading: false,

    loadHistory: async () => {
        // TODO: Implement history loading from /api/coach/history if needed
        // For now, start fresh or load from localStorage? 
        // We'll skip for this step to focus on the interaction loop.
    },

    sendMessage: async (text: string) => {
        const userMsg: CoachMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: text,
            mode: 'ask' // default
        };

        set(state => ({
            messages: [...state.messages, userMsg],
            isLoading: true
        }));

        try {
            const res = await apiClient.post<CoachResponse>('/api/coach/message', {
                message: text,
                date: new Date().toISOString()
            });

            const assistantMsg: CoachMessage = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: res.summary,
                mode: res.mode,
                options: res.options,
            };

            set(state => ({
                messages: [...state.messages, assistantMsg],
                isLoading: false
            }));

        } catch (error) {
            console.error("Coach Error", error);
            // Fallback message
            set(state => ({
                messages: [...state.messages, {
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: "I'm having trouble connecting. Please try again.",
                    mode: 'refuse'
                }],
                isLoading: false
            }));
        }
    },

    applyOption: async (messageId: string, optionId: string) => {
        // Mark as applying
        set(state => ({
            messages: state.messages.map(m =>
                m.id === messageId ? { ...m, isApplying: true } : m
            )
        }));

        try {
            // Find option
            const msg = get().messages.find(m => m.id === messageId);
            const option = msg?.options?.find(o => o.id === optionId);

            if (!option) throw new Error("Option not found");

            // Call Apply API
            await apiClient.post('/api/coach/apply', {
                patch: option.patch,
                optionId
            });

            // Update UI to show applied
            set(state => ({
                messages: state.messages.map(m =>
                    m.id === messageId ? { ...m, isApplying: false, appliedOptionId: optionId } : m
                )
            }));

            // Refresh Calendar
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('calendar-refresh'));
            }

        } catch (error) {
            console.error("Apply Failed", error);
            set(state => ({
                messages: state.messages.map(m =>
                    m.id === messageId ? { ...m, isApplying: false } : m
                )
            }));
        }
    }
}));
