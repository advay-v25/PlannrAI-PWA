'use client';

import { create } from 'zustand';
import { apiClient } from '@/lib/api-client';

export interface BrainDumpItem {
    title: string;
    kind: 'task' | 'commitment' | 'note' | 'worry' | 'idea' | 'habit' | 'constraint';
    est_min?: number;
    due_date?: string;
    urgency?: number;
    importance?: number;
    pillar?: string;
}

export interface BrainDumpConstraint {
    type: 'time_block' | 'deadline' | 'unavailable' | 'health' | 'travel';
    description: string;
    start_time?: string;
    end_time?: string;
    date?: string;
}

export interface BrainDumpSignals {
    energy?: number;
    sentiment?: number;
    overwhelm?: number;
    motivation?: number;
    stress?: number;
    health_flag?: string;
}

export interface BrainDumpOption {
    id: string;
    title: string;
    impact: string;
    patch: any;
}

export interface BrainDumpQuestion {
    prompt: string;
    type: 'text' | 'confirm' | 'choice';
    choices?: string[];
}

export interface BrainDumpResponse {
    mode: string;
    summary: string;
    extracted: {
        summary?: string;
        items: BrainDumpItem[];
        constraints: BrainDumpConstraint[];
        signals: BrainDumpSignals;
    };
    options: BrainDumpOption[];
    question?: BrainDumpQuestion;
}

interface BrainDumpState {
    input: string;
    isLoading: boolean;
    isApplying: boolean;
    response: BrainDumpResponse | null;
    extractedItems: BrainDumpItem[];
    constraints: BrainDumpConstraint[];
    signals: BrainDumpSignals | null;
    options: BrainDumpOption[];
    question: BrainDumpQuestion | null;
    appliedOptionId: string | null;
    lastUndoToken: string | null;
    dumpId: string | null;
    error: string | null;
    setInput: (text: string) => void;
    submitDump: () => Promise<void>;
    applyOption: (optionId: string) => Promise<void>;
    undoLastAction: () => Promise<void>;
    reset: () => void;
}

export const useBrainDump = create<BrainDumpState>((set, get) => ({
    input: '',
    isLoading: false,
    isApplying: false,
    response: null,
    extractedItems: [],
    constraints: [],
    signals: null,
    options: [],
    question: null,
    appliedOptionId: null,
    lastUndoToken: null,
    dumpId: null,
    error: null,

    setInput: (text: string) => set({ input: text }),

    submitDump: async () => {
        const { input } = get();
        if (!input.trim()) return;

        set({
            isLoading: true,
            response: null,
            extractedItems: [],
            constraints: [],
            signals: null,
            options: [],
            question: null,
            appliedOptionId: null,
            lastUndoToken: null,
            error: null
        });

        try {
            const res = await apiClient.post<BrainDumpResponse>('/api/brain-dump/submit', {
                text: input,
                date: new Date().toISOString()
            });

            set({
                response: res,
                extractedItems: res.extracted?.items || [],
                constraints: res.extracted?.constraints || [],
                signals: res.extracted?.signals || null,
                options: res.options || [],
                question: res.question || null,
                isLoading: false
            });
        } catch (error: any) {
            console.error("Brain Dump Error", error);
            set({
                isLoading: false,
                error: error.message || "Failed to process brain dump"
            });
        }
    },

    applyOption: async (optionId: string) => {
        const { options, response } = get();
        const option = options.find(o => o.id === optionId);
        if (!option) return;

        set({ isApplying: true, error: null });

        try {
            const res = await apiClient.post<{ success: boolean; undo_token: string | null; changes: number }>(
                '/api/brain-dump/apply',
                {
                    patch: option.patch,
                    optionId,
                    dumpId: (response as any)?.dumpId || 'current'
                }
            );

            set({
                isApplying: false,
                appliedOptionId: optionId,
                lastUndoToken: res.undo_token
            });

            // Refresh calendar
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('calendar-refresh'));
            }
        } catch (error: any) {
            console.error("Apply Failed", error);
            set({
                isApplying: false,
                error: error.message || "Failed to apply option"
            });
        }
    },

    undoLastAction: async () => {
        const { lastUndoToken } = get();
        if (!lastUndoToken) return;

        try {
            await apiClient.post('/api/coach/undo', { undo_token: lastUndoToken });
            set({
                appliedOptionId: null,
                lastUndoToken: null
            });

            // Refresh calendar
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('calendar-refresh'));
            }
        } catch (error: any) {
            console.error("Undo Failed", error);
            set({ error: error.message || "Failed to undo" });
        }
    },

    reset: () => set({
        input: '',
        isLoading: false,
        isApplying: false,
        response: null,
        extractedItems: [],
        constraints: [],
        signals: null,
        options: [],
        question: null,
        appliedOptionId: null,
        lastUndoToken: null,
        dumpId: null,
        error: null
    })
}));
