'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

// ============ TYPES ============
export interface CoachMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    mode?: 'execute' | 'propose' | 'clarify' | 'acknowledge' | 'inform';
    options?: CoachOption[];
    selected_option_id?: string;
    patch_version_id?: string;
    created_at: string;
}

export interface CoachOption {
    id: string;
    title: string;
    description: string;
    impact: string;
    tradeoff?: {
        warning: string;
        severity: 'info' | 'caution' | 'warning';
    };
    patch: any;
    preview: {
        blocks_added: number;
        blocks_modified: number;
        blocks_removed: number;
        affected_dates: string[];
    };
    recommended: boolean;
}

export interface CoachResponse {
    id: string;
    timestamp: string;
    mode: 'execute' | 'propose' | 'clarify' | 'acknowledge' | 'inform';
    summary: string;
    options?: CoachOption[];
    clarification?: {
        question: string;
        suggestions?: string[];
    };
    acknowledgment?: {
        message: string;
        offer?: string;
    };
    minimal_mode: boolean;
    conversation_context: {
        can_undo: boolean;
        last_patch_version_id?: string;
    };
    options_expire_at: string;
}

export interface ProactiveSuggestion {
    id: string;
    trigger_type: string;
    title: string;
    message: string;
    action_label: string;
    priority: 'high' | 'medium' | 'low';
}

interface UseCoachReturn {
    // State
    messages: CoachMessage[];
    isLoading: boolean;
    error: string | null;
    conversationId: string | null;
    minimalMode: boolean;
    canUndo: boolean;
    lastVersionId: string | null;

    // Proactive
    proactiveSuggestion: ProactiveSuggestion | null;
    checkingProactive: boolean;

    // Actions
    sendMessage: (message: string) => Promise<CoachResponse | null>;
    applyOption: (option: CoachOption) => Promise<boolean>;
    undo: () => Promise<boolean>;
    dismissProactive: () => Promise<void>;
    actOnProactive: () => void;
    clearError: () => void;
    resetConversation: () => void;

    // Refs for UI
    messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

// ============ HOOK ============
export function useCoach(): UseCoachReturn {
    // State
    const [messages, setMessages] = useState<CoachMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [minimalMode, setMinimalMode] = useState(false);
    const [canUndo, setCanUndo] = useState(false);
    const [lastVersionId, setLastVersionId] = useState<string | null>(null);

    // Proactive
    const [proactiveSuggestion, setProactiveSuggestion] = useState<ProactiveSuggestion | null>(null);
    const [checkingProactive, setCheckingProactive] = useState(false);

    // Refs
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Load history on mount
    useEffect(() => {
        loadHistory();
        checkProactive();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Load conversation history
    const loadHistory = useCallback(async () => {
        try {
            const response = await fetch('/api/coach/history');
            const data = await response.json();

            if (data.success) {
                setConversationId(data.conversation_id);
                setMessages(data.messages || []);

                // Check if last message has undo capability
                const lastAssistant = (data.messages || []).filter((m: any) => m.role === 'assistant').pop();
                if (lastAssistant?.patch_version_id) {
                    setCanUndo(true);
                    setLastVersionId(lastAssistant.patch_version_id);
                }
            }
        } catch (err) {
            console.error('Failed to load coach history:', err);
        }
    }, []);

    // Check for proactive suggestions
    const checkProactive = useCallback(async () => {
        setCheckingProactive(true);

        try {
            const response = await fetch('/api/coach/proactive');
            const data = await response.json();

            if (data.success && data.has_suggestion) {
                setProactiveSuggestion(data.suggestion);
            }
        } catch (err) {
            console.error('Failed to check proactive:', err);
        } finally {
            setCheckingProactive(false);
        }
    }, []);

    // Send message to coach
    const sendMessage = useCallback(async (message: string): Promise<CoachResponse | null> => {
        if (!message.trim()) return null;

        setIsLoading(true);
        setError(null);

        // Optimistically add user message
        const userMessage: CoachMessage = {
            id: `temp_${Date.now()}`,
            role: 'user',
            content: message,
            created_at: new Date().toISOString(),
        };

        setMessages(prev => [...prev, userMessage]);

        try {
            const response = await fetch('/api/coach/message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message,
                    conversation_id: conversationId,
                }),
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Failed to send message');
            }

            // Update conversation ID
            if (data.conversation_id) {
                setConversationId(data.conversation_id);
            }

            // Add assistant response
            const assistantMessage: CoachMessage = {
                id: data.response.id,
                role: 'assistant',
                content: data.response.summary,
                mode: data.response.mode,
                options: data.response.options,
                created_at: new Date().toISOString(),
            };

            setMessages(prev => [...prev, assistantMessage]);

            // Update state
            setMinimalMode(data.response.minimal_mode);
            setCanUndo(data.response.conversation_context.can_undo);
            setLastVersionId(data.response.conversation_context.last_patch_version_id || null);

            return data.response;

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            setError(errorMessage);

            // Remove optimistic message on error
            setMessages(prev => prev.filter(m => m.id !== userMessage.id));

            return null;
        } finally {
            setIsLoading(false);
        }
    }, [conversationId]);

    // Apply selected option
    const applyOption = useCallback(async (option: CoachOption): Promise<boolean> => {
        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/coach/apply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversation_id: conversationId,
                    option_id: option.id,
                    patch: option.patch,
                }),
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                // Check for conflict
                if (data.conflict) {
                    setError(`Conflict: ${data.conflict.message}`);

                    // Update options if provided
                    if (data.updated_options) {
                        setMessages(prev => {
                            const newMessages = [...prev];
                            const lastAssistant = newMessages.filter(m => m.role === 'assistant').pop();
                            if (lastAssistant) {
                                lastAssistant.options = data.updated_options;
                            }
                            return newMessages;
                        });
                    }
                } else {
                    throw new Error(data.error || 'Failed to apply changes');
                }
                return false;
            }

            // Update undo capability
            setCanUndo(true);
            setLastVersionId(data.version_id);

            // Mark option as selected in messages
            setMessages(prev => {
                const newMessages = [...prev];
                const lastAssistant = newMessages.filter(m => m.role === 'assistant').pop();
                if (lastAssistant) {
                    lastAssistant.selected_option_id = option.id;
                    lastAssistant.patch_version_id = data.version_id;
                }
                return newMessages;
            });

            return true;

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            setError(errorMessage);
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [conversationId]);

    // Undo last change
    const undo = useCallback(async (): Promise<boolean> => {
        if (!lastVersionId) return false;

        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/coach/undo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ version_id: lastVersionId }),
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Failed to undo');
            }

            setCanUndo(false);
            setLastVersionId(null);

            // Clear selected option from last message
            setMessages(prev => {
                const newMessages = [...prev];
                const lastAssistant = newMessages.filter(m => m.role === 'assistant').pop();
                if (lastAssistant) {
                    lastAssistant.selected_option_id = undefined;
                    lastAssistant.patch_version_id = undefined;
                }
                return newMessages;
            });

            return true;

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            setError(errorMessage);
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [lastVersionId]);

    // Dismiss proactive suggestion
    const dismissProactive = useCallback(async () => {
        if (!proactiveSuggestion) return;

        try {
            await fetch('/api/coach/dismiss', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ suggestion_id: proactiveSuggestion.id }),
            });
        } catch (err) {
            console.error('Failed to dismiss proactive:', err);
        } finally {
            setProactiveSuggestion(null);
        }
    }, [proactiveSuggestion]);

    // Act on proactive suggestion
    const actOnProactive = useCallback(() => {
        if (!proactiveSuggestion) return;

        // Send the action as a message
        sendMessage(proactiveSuggestion.action_label);
        setProactiveSuggestion(null);
    }, [proactiveSuggestion, sendMessage]);

    // Clear error
    const clearError = useCallback(() => {
        setError(null);
    }, []);

    // Reset conversation
    const resetConversation = useCallback(() => {
        setMessages([]);
        setConversationId(null);
        setCanUndo(false);
        setLastVersionId(null);
        setError(null);
    }, []);

    return {
        messages,
        isLoading,
        error,
        conversationId,
        minimalMode,
        canUndo,
        lastVersionId,
        proactiveSuggestion,
        checkingProactive,
        sendMessage,
        applyOption,
        undo,
        dismissProactive,
        actOnProactive,
        clearError,
        resetConversation,
        messagesEndRef,
    };
}
