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
    selected_option_id?: string;
    undoToken?: string | null;
}


interface CoachState {
    messages: CoachMessage[];
    conversationId: string | null; // BUG 2 FIX: Track conversation_id
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

/**
 * Extracts the CoachResponse from the API response,
 * handling both envelope formats:
 *   - { success, conversation_id, response: {...} }  (from /api/coach/message)
 *   - { ok, data: {...} }  (if apiClient auto-unwraps)
 *   - Direct CoachResponse  (if already unwrapped)
 */
function extractCoachResponse(raw: any): { response: any; conversationId?: string } {
    // Format: { success, conversation_id, response }
    if (raw?.response && typeof raw.response === 'object') {
        return { response: raw.response, conversationId: raw.conversation_id };
    }
    // Already unwrapped CoachResponse (has summary/mode directly)
    if (raw?.summary || raw?.mode) {
        return { response: raw, conversationId: raw.conversation_id };
    }
    // Fallback
    return { response: raw };
}

export const useCoach = create<CoachState>((set, get) => ({
    messages: [],
    conversationId: null,
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
            const raw = await apiClient.post('/api/coach/message', {
                message: text,
                conversation_id: get().conversationId, // Send tracked conversation_id
                date: new Date().toISOString()
            });

            const { response: coachRes, conversationId } = extractCoachResponse(raw);

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
                conversationId: conversationId || state.conversationId, // Track it
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
        const { messages, conversationId } = get();
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
                { 
                    patch: option.patch, 
                    option_id: optionId,           // BUG 2 FIX: correct field name
                    conversation_id: conversationId // BUG 2 FIX: include conversation_id
                }
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
            const raw = await apiClient.post('/api/coach/message', {
                message: "What should I focus on right now?",
                conversation_id: get().conversationId,
                date: new Date().toISOString(),
                proactive: true
            });

            // BUG 3 FIX: Use the same envelope extractor
            const { response: coachRes, conversationId } = extractCoachResponse(raw);

            const insightMsg: CoachMessage = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: coachRes.summary || '',
                mode: coachRes.mode,
                thinking: coachRes.thinking,
                contextUsed: coachRes.context_used,
                options: coachRes.options,
                question: coachRes.question,
                suggestedActions: coachRes.suggested_actions
            };

            set(state => ({
                messages: [insightMsg],
                conversationId: conversationId || state.conversationId,
                isLoading: false,
                suggestedActions: coachRes.suggested_actions || [],
                canUndo: !!coachRes.undo_token,
                lastUndoToken: coachRes.undo_token || state.lastUndoToken
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
