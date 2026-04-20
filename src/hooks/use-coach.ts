'use client';

import { create } from 'zustand';
import { apiClient } from '@/lib/api-client';
import type { CoachResponse, CoachOption, CoachQuestion, CoachRefusal, ProactiveSuggestion } from '@/types/coach-v4';


export interface CoachMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    mode?: string;
    thinking?: string[];
    contextUsed?: string[];
    options?: CoachOption[];
    question?: CoachQuestion;
    refusal?: CoachRefusal;
    suggestedActions?: string[];
    isApplying?: boolean;
    selected_option_id?: string; // Match UI expectation
    undoToken?: string | null;
}


interface CoachState {
    messages: CoachMessage[];
    isLoading: boolean;
    error: string | null;
    minimalMode: boolean;
    canUndo: boolean;
    lastUndoToken: string | null;
    suggestedActions: string[];
    hasLoadedProactive: boolean;
    proactiveSuggestion: ProactiveSuggestion | null; 

    checkingProactive: boolean;
    sendMessage: (text: string) => Promise<void>;

    applyOption: (messageId: string, optionId: string) => Promise<boolean>;
    undo: () => Promise<boolean>;
    clearError: () => void;
    loadProactiveInsight: () => Promise<void>;
    dismissProactive: () => Promise<void>;
    actOnProactive: () => void;
}

export const useCoach = create<CoachState>((set, get) => ({
    messages: [],
    isLoading: false,
    error: null,
    minimalMode: false,
    canUndo: false,
    lastUndoToken: null,
    suggestedActions: [],
    hasLoadedProactive: false,
    proactiveSuggestion: null,
    checkingProactive: false,


    sendMessage: async (text: string) => {

        const userMsg: CoachMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: text
        };
        set(state => ({ 
            messages: [...state.messages, userMsg], 
            isLoading: true,
            error: null 
        }));

        try {
            const res = await apiClient.post<CoachResponse>('/api/coach/message', {
                message: text,
                date: new Date().toISOString()
            });

            // Extract the actual response data from the carrier object
            const coachRes = (res as any).response || res;

            const assistantMsg: CoachMessage = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: coachRes.summary || '',
                mode: coachRes.mode,
                thinking: coachRes.thinking,
                contextUsed: coachRes.context_used,
                options: coachRes.options,
                question: coachRes.question,
                refusal: coachRes.refusal,
                suggestedActions: coachRes.suggested_actions
            };

            set(state => ({
                messages: [...state.messages, assistantMsg],
                isLoading: false,
                minimalMode: coachRes.mode === 'ask' || (coachRes.thinking?.length === 0),
                suggestedActions: coachRes.suggested_actions || state.suggestedActions,
                canUndo: !!coachRes.undo_token,
                lastUndoToken: coachRes.undo_token || state.lastUndoToken
            }));

            // AUTO-EXECUTION: If mode is 'execute' and there is a recommended option, apply it immediately
            if (coachRes.mode === 'execute' && coachRes.options?.length) {
                const recommended = coachRes.options.find((o: any) => o.recommended) || coachRes.options[0];
                if (recommended) {
                    console.log('[Coach] Auto-executing directive:', recommended.title);
                    get().applyOption(assistantMsg.id, recommended.id);
                }
            }
        } catch (error: any) {
            console.error("Coach Error", error);
            set(state => ({
                messages: state.messages.filter(m => m.id !== userMsg.id),
                isLoading: false,
                error: error.message || "Connection issue. Please try again."
            }));
        }
    },

    applyOption: async (messageId: string, optionId: string) => {
        const { messages } = get();
        const msg = messages.find(m => m.id === messageId);
        const option = msg?.options?.find(o => o.id === optionId);
        if (!option) return false;


        set(state => ({
            messages: state.messages.map(m =>
                m.id === messageId ? { ...m, isApplying: true } : m
            ),
            error: null
        }));

        try {
            const res = await apiClient.post<{ success: boolean; undo_token: string | null; changes: number }>(
                '/api/coach/apply',
                { patch: option.patch, optionId }
            );

            set(state => ({
                messages: state.messages.map(m =>
                    m.id === messageId
                        ? { ...m, isApplying: false, selected_option_id: optionId, undoToken: res.undo_token }
                        : m
                ),
                lastUndoToken: res.undo_token,
                canUndo: !!res.undo_token
            }));

            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('calendar-refresh'));
            }
            return true;
        } catch (error: any) {
            console.error("Apply Failed", error);
            set(state => ({
                messages: state.messages.map(m =>
                    m.id === messageId ? { ...m, isApplying: false } : m
                ),
                error: error.message || "Failed to apply changes."
            }));
            return false;
        }
    },

    undo: async (): Promise<boolean> => {
        const { lastUndoToken } = get();
        if (!lastUndoToken) return false;
        
        set({ isLoading: true, error: null });
        try {
            await apiClient.post('/api/coach/undo', { undo_token: lastUndoToken });

            set(state => ({
                messages: state.messages.map(m =>
                    m.undoToken === lastUndoToken
                        ? { ...m, selected_option_id: undefined, undoToken: null }
                        : m
                ),
                lastUndoToken: null,
                canUndo: false,
                isLoading: false
            }));

            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('calendar-refresh'));
            }
            return true;
        } catch (error: any) {
            console.error("Undo Failed", error);
            set({ isLoading: false, error: error.message || "Undo failed." });
            return false;
        }
    },


    clearError: () => set({ error: null }),

    loadProactiveInsight: async () => {
        if (get().hasLoadedProactive) return;
        set({ hasLoadedProactive: true, isLoading: true, error: null });

        try {
            const res = await apiClient.post<CoachResponse>('/api/coach/message', {
                message: "What should I focus on right now?",
                date: new Date().toISOString(),
                proactive: true
            });

            const insightMsg: CoachMessage = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: res.summary || '',
                mode: res.mode,
                thinking: res.thinking,
                contextUsed: res.context_used,
                options: res.options,
                question: res.question,
                suggestedActions: res.suggested_actions
            };

            set(state => ({
                messages: [insightMsg],
                isLoading: false,
                suggestedActions: res.suggested_actions || [],
                canUndo: !!res.undo_token,
                lastUndoToken: res.undo_token || state.lastUndoToken
            }));
        } catch (error: any) {
            console.error("Proactive insight failed", error);
            set({ isLoading: false });
        }
    },

    dismissProactive: async () => {
        const { proactiveSuggestion } = get();
        if (!proactiveSuggestion) return;
        try {
            await apiClient.post('/api/coach/dismiss', { suggestion_id: proactiveSuggestion.id });
            set({ proactiveSuggestion: null });
        } catch (e) {
            console.error("Failed to dismiss proactive", e);
            set({ proactiveSuggestion: null });
        }
    },

    actOnProactive: () => {
        const { proactiveSuggestion, sendMessage } = get();
        if (!proactiveSuggestion) return;
        sendMessage(proactiveSuggestion.action_label);
        set({ proactiveSuggestion: null });
    }
}));


