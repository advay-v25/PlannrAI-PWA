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
    loadHistory: () => Promise<void>;
}

export const useAgentStore = create<AgentState>((set, get) => ({
    messages: [],
    isLoading: false,
    isApplying: false,

    loadHistory: async () => {
        set({ isLoading: true });
        try {
            // Lazy load client to avoid SSR issues if store init early
            const { createClient } = await import('@/lib/supabase/client');
            const supabase = createClient();

            const { data: dbMessages } = await supabase
                .from('coach_messages')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(50);

            if (!dbMessages) {
                set({ isLoading: false });
                return;
            }

            const parsedMessages: Message[] = dbMessages.reverse().map(msg => {
                let content = msg.content;
                let options: CoachOption[] = [];
                let mode: CoachMode = 'choice';
                let refusal = undefined;

                if (msg.role === 'assistant') {
                    try {
                        const parsed = JSON.parse(msg.content);
                        // Handle AIResponse structure
                        if (parsed.summary || parsed.options || parsed.question || parsed.refusal) {
                            content = parsed.summary || parsed.question || "How can I help?";

                            options = parsed.options?.map((opt: any, idx: number) => ({
                                id: `hist_${msg.id}_${idx}`,
                                title: opt.title,
                                impact: opt.impact || opt.title,
                                patch: opt.patch
                            })) || [];

                            if (parsed.refusal) {
                                mode = 'refusal';
                                refusal = { reason: parsed.refusal };
                                content = parsed.refusal; // Override content if refusal
                            } else if (parsed.question && (!parsed.options?.length)) {
                                mode = 'choice';
                            } else if (parsed.options?.length > 0) {
                                mode = 'choice';
                            } else {
                                mode = 'executed';
                            }
                        }
                    } catch (e) {
                        // Fallback: raw text content if not JSON
                        mode = 'choice';
                    }
                }

                return {
                    id: msg.id,
                    role: msg.role === 'assistant' ? 'agent' : 'user',
                    content,
                    mode,
                    options,
                    refusal,
                    timestamp: new Date(msg.created_at)
                };
            });

            set({ messages: parsedMessages, isLoading: false });
        } catch (e) {
            console.error("Failed to load history", e);
            set({ isLoading: false });
        }
    },

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
            // Call AI Gateway with Channel: coach
            const gatewayRes = await apiClient.post<any>('/api/ai/execute', {
                channel: 'coach',
                input: text,
                context: {
                    // Send recent messages as history for context continuity
                    // Filter out complex objects, send simplified history
                    history: get().messages.slice(-6).map(m => ({
                        role: m.role === 'agent' ? 'assistant' : 'user',
                        content: m.content
                    })),
                    mode: 'chat'
                }
            });

            const data = gatewayRes.data || gatewayRes;

            // Map AIResponse to Coach Message
            let mode: CoachMode = 'choice';
            let content = data.summary;
            let refusal = undefined;

            if (data.refusal) {
                mode = 'refusal';
                refusal = { reason: data.refusal };
                content = data.refusal;
            } else if (data.question && (!data.options || data.options.length === 0)) {
                content = data.question || data.summary;
            } else if (data.options?.length > 0) {
                mode = 'choice';
            } else {
                mode = 'executed';
            }

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
