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
            // Call AI Gateway
            // Channel: coach (V4 logic)
            const gatewayRes = await apiClient.post<any>('/api/ai/execute', {
                channel: 'coach',
                input: text,
                context: {
                    history: get().messages.slice(-6).map(m => ({ role: m.role, content: m.content })),
                    mode: 'chat'
                }
            });

            const data = gatewayRes.data || gatewayRes;

            // Map AIResponse to Coach Message Structure
            // AIResponse: { summary, options, question, refusal }
            // Message: { content, options, mode, refusal, ... }

            let mode: CoachMode = 'choice';
            let content = data.summary;
            let refusal = undefined;

            if (data.refusal) {
                mode = 'refusal';
                refusal = { reason: data.refusal };
            } else if (data.question && (!data.options || data.options.length === 0)) {
                // If question but no options, it's effectively a chat/ask turn
                // We keep mode as 'choice' (default) or could add 'ask' if needed
                // UI handles questions via content usually
                content = data.question || data.summary;
            } else if (data.options?.length > 0) {
                mode = 'choice';
            } else {
                // Just text response
                mode = 'executed'; // 'executed' usually means "done". 
                // But for chat, maybe we just use 'choice' with no options?
                // Or leave mode undefined?
                // Let's use 'choice' with empty options to imply "I'm listening/talking".
                mode = 'choice';
            }

            // Map Options
            const options: CoachOption[] = data.options?.map((opt: any, idx: number) => ({
                id: `opt_${Date.now()}_${idx}`,
                title: opt.title,
                impact: opt.impact || opt.title,
                patch: opt.patch
            })) || [];

            const agentMsg: Message = {
                id: crypto.randomUUID(),
                role: 'agent',
                content: content,
                mode: mode,
                options: options,
                refusal: refusal,
                isImpossible: mode === 'refusal',
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
            // Use standard Apply Patch endpoint
            const data = await apiClient.post<{ success: boolean; patch_run_id: string }>('/api/calendar/apply-patch', {
                patch: selectedOption.patch
            });

            // Add confirmation message
            const successMsg: Message = {
                id: crypto.randomUUID(),
                role: 'agent',
                content: `Applied: ${selectedOption.title}`,
                mode: 'executed',
                undoToken: data.patch_run_id, // Store run ID as token
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
            // Use standard Undo Patch endpoint
            // It undoes the *last* action for the user, logic is LIFO.
            // We pass token just in case we want to validate, but currently endpoint ignores it.
            await apiClient.post('/api/patch/undo', { undo_token: token });

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
