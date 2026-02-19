'use client';

import { create } from 'zustand';
import { apiClient } from '@/lib/api-client';
import type { CoachResponse, CoachOption, CoachQuestion, CoachRefusal } from '@/types/coach-v4';

export interface CoachMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    mode?: string;
    options?: CoachOption[];
    question?: CoachQuestion;
    refusal?: CoachRefusal;
    isApplying?: boolean;
    appliedOptionId?: string;
    undoToken?: string | null;
}

interface CoachState {
    messages: CoachMessage[];
    isLoading: boolean;
    lastUndoToken: string | null;
    sendMessage: (text: string) => Promise<void>;
    applyOption: (messageId: string, optionId: string) => Promise<void>;
    undoLastAction: () => Promise<void>;
    undoByToken: (token: string) => Promise<void>;
    loadHistory: () => Promise<void>;
}

export const useCoach = create<CoachState>((set, get) => ({
    messages: [],
    isLoading: false,
    lastUndoToken: null,

    sendMessage: async (text: string) => {
        const userMsg: CoachMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: text
        };
        set(state => ({ messages: [...state.messages, userMsg], isLoading: true }));

        try {
            const res = await apiClient.post<CoachResponse>('/api/coach/message', {
                message: text,
                date: new Date().toISOString()
            });

            const assistantMsg: CoachMessage = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: res.summary || '',
                mode: res.mode,
                options: res.options,
                question: res.question,
                refusal: res.refusal
            };

            set(state => ({
                messages: [...state.messages, assistantMsg],
                isLoading: false
            }));
        } catch (error) {
            console.error("Coach Error", error);
            set(state => ({
                messages: [...state.messages, {
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: "Having trouble connecting. Please try again.",
                    mode: 'refuse',
                    refusal: { reason: "Connection issue. Try again in a moment." }
                }],
                isLoading: false
            }));
        }
    },

    applyOption: async (messageId: string, optionId: string) => {
        const { messages } = get();
        const msg = messages.find(m => m.id === messageId);
        const option = msg?.options?.find(o => o.id === optionId);
        if (!option) return;

        // Mark as applying
        set(state => ({
            messages: state.messages.map(m =>
                m.id === messageId ? { ...m, isApplying: true } : m
            )
        }));

        try {
            const res = await apiClient.post<{ success: boolean; undo_token: string | null; changes: number }>(
                '/api/coach/apply',
                { patch: option.patch, optionId }
            );

            set(state => ({
                messages: state.messages.map(m =>
                    m.id === messageId
                        ? { ...m, isApplying: false, appliedOptionId: optionId, undoToken: res.undo_token }
                        : m
                ),
                lastUndoToken: res.undo_token
            }));

            // Refresh calendar
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
    },

    undoLastAction: async () => {
        const { lastUndoToken } = get();
        if (!lastUndoToken) return;
        await get().undoByToken(lastUndoToken);
    },

    undoByToken: async (token: string) => {
        try {
            await apiClient.post('/api/coach/undo', { undo_token: token });

            // Clear undo token from messages that used it
            set(state => ({
                messages: state.messages.map(m =>
                    m.undoToken === token
                        ? { ...m, appliedOptionId: undefined, undoToken: null }
                        : m
                ),
                lastUndoToken: state.lastUndoToken === token ? null : state.lastUndoToken
            }));

            // Refresh calendar
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('calendar-refresh'));
            }
        } catch (error) {
            console.error("Undo Failed", error);
        }
    },

    loadHistory: async () => {
        // Future: load from /api/coach/history
        // For now, maintain in-memory session state
    }
}));
