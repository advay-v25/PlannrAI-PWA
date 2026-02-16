
import { create } from 'zustand';
import { apiClient } from '@/lib/api-client';
import { BrainDumpResponseSchema } from '@/lib/ai/schemas';
import { z } from 'zod';

export type BrainDumpResponse = z.infer<typeof BrainDumpResponseSchema>;
export type ExtractedItem = NonNullable<BrainDumpResponse['extracted']['items']>[number];
export type DumpOption = NonNullable<BrainDumpResponse['options']>[number];

interface BrainDumpState {
    input: string;
    isLoading: boolean;
    isApplying: boolean;
    response: BrainDumpResponse | null;
    extractedItems: ExtractedItem[];
    options: DumpOption[];

    // Actions
    setInput: (text: string) => void;
    submitDump: () => Promise<void>;
    applyOption: (optionId: string) => Promise<void>;
    reset: () => void;
}

export const useBrainDump = create<BrainDumpState>((set, get) => ({
    input: '',
    isLoading: false,
    isApplying: false,
    response: null,
    extractedItems: [],
    options: [],

    setInput: (text) => set({ input: text }),

    submitDump: async () => {
        const { input } = get();
        if (!input.trim()) return;

        set({ isLoading: true, response: null, extractedItems: [], options: [] });

        try {
            const res = await apiClient.post<BrainDumpResponse>('/api/brain-dump/submit', {
                text: input,
                date: new Date().toISOString()
            });

            set({
                response: res,
                extractedItems: res.extracted?.items || [],
                options: res.options || [],
                isLoading: false
            });

        } catch (error) {
            console.error("Brain Dump Error", error);
            // Fallback (UI should handle error state, but let's reset loading)
            set({ isLoading: false });
        }
    },

    applyOption: async (optionId: string) => {
        set({ isApplying: true });
        const { options, response } = get();
        const option = options.find(o => o.id === optionId);

        if (!option) {
            set({ isApplying: false });
            return;
        }

        try {
            await apiClient.post('/api/brain-dump/apply', {
                patch: option.patch,
                optionId,
                dumpId: response?.extracted ? 'current' : undefined // In real app, we'd use actual dump ID returned
            });

            // Optimistic success - maybe clear options or show success
            // For now, let's keep the state but mark applying done
            set({ isApplying: false });

            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('calendar-refresh'));
            }

        } catch (error) {
            console.error("Apply Failed", error);
            set({ isApplying: false });
        }
    },

    reset: () => set({
        input: '',
        isLoading: false,
        isApplying: false,
        response: null,
        extractedItems: [],
        options: []
    })
}));
