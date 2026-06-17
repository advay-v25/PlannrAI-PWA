'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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
  timestamp?: number;
}

interface PersistentCoachData {
  messages: CoachMessage[];
  conversationId: string | null;
  suggestedActions: string[];
  lastSync: number | null;
}

interface CoachState extends PersistentCoachData {
  isLoading: boolean;
  error: string | null;
  minimalMode: boolean;
  canUndo: boolean;
  lastUndoToken: string | null;
  hasLoadedProactive: boolean;
  proactiveSuggestion: ProactiveSuggestion | null;
  checkingProactive: boolean;
  connectionStatus: 'connected' | 'disconnected' | 'connecting';
  abortController: AbortController | null;
  
  sendMessage: (text: string) => Promise<{ success: boolean; error?: string }>;
  stopGenerating: () => string;
  applyOption: (messageId: string, optionId: string) => Promise<CoachOption | boolean>;
  undo: () => Promise<boolean>;
  clearError: () => void;
  refreshContext: () => Promise<void>;
  loadProactiveInsight: () => Promise<void>;
  loadHistory: (conversationId?: string) => Promise<void>;
  dismissProactive: () => Promise<void>;
  actOnProactive: () => void;
  clearConversation: () => void;
  retryLastAction: () => void;
  getLatestMessageWithOptions: () => CoachMessage | undefined;
}

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

const STORAGE_KEY = 'plannrai-coach-conversation';

export const useCoach = create<CoachState>()(
  persist(
    (set, get) => ({
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
      lastSync: null,
      connectionStatus: 'connecting',
      abortController: null,

      stopGenerating: () => {
        const { abortController, messages } = get();
        if (abortController) {
          abortController.abort();
          const lastMsg = messages[messages.length - 1];
          set({
            isLoading: false,
            abortController: null,
            // Remove the last user message so they can edit it
            messages: messages.filter(m => m.id !== lastMsg?.id)
          });
          return lastMsg?.content || '';
        }
        return '';
      },

      refreshContext: async () => {
        set({ isLoading: true, error: null, connectionStatus: 'connecting' });
        try {
          const raw = await apiClient.post('/api/coach/message', {
            message: "Analyze my current context and give me an immediate execution and performance insight.",
            conversation_id: get().conversationId,
            date: new Date().toISOString(),
            clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          });

          const { response: coachRes, conversationId } = extractCoachResponse(raw);

          const sanitizeSummary = (text: string) => {
              if (!text) return text;
              const trimmed = text.trim();
              if (trimmed.startsWith('{') || trimmed.includes('"options":')) {
                  try {
                      const parsed = JSON.parse(trimmed);
                      return parsed.summary || parsed.text || parsed.response || "I've prepared some options for you.";
                  } catch (e) {
                      if (trimmed.startsWith('{')) return "I've prepared some options for you.";
                      const jsonStart = trimmed.indexOf('{');
                      if (jsonStart > 0) return trimmed.substring(0, jsonStart).trim();
                      return "I've prepared some options for you.";
                  }
              }
              return text.replace(/```json\s*\{[\s\S]*\}\s*```/g, "I've prepared some options for you.")
                         .replace(/```\s*\{[\s\S]*\}\s*```/g, "I've prepared some options for you.");
          };

          const assistantMsg: CoachMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: sanitizeSummary(coachRes.summary || ''),
            mode: coachRes.mode,
            options: coachRes.options,
            timestamp: Date.now()
          };

          set(state => ({
            messages: [...state.messages, assistantMsg],
            conversationId: conversationId || state.conversationId,
            isLoading: false,
            connectionStatus: 'connected',
            lastSync: Date.now()
          }));
        } catch (error: any) {
          console.error("Coach Refresh Error:", error);
          set({ isLoading: false, connectionStatus: 'disconnected' });
        }
      },

      sendMessage: async (text: string) => {
        const userMsg: CoachMessage = {
          id: crypto.randomUUID(),
          role: 'user',
          content: text,
          timestamp: Date.now()
        };
        
        const abortController = new AbortController();
        set(state => ({
          messages: [...state.messages, userMsg],
          isLoading: true,
          error: null,
          connectionStatus: 'connecting',
          abortController
        }));

        try {
          // Test connection first
          const connectionTest = await fetch('/api/health', { method: 'HEAD' }).catch(() => null);
          if (!connectionTest?.ok) {
            throw new Error('Connection error. Please check your internet connection.');
          }

          const raw = await apiClient.post('/api/coach/message', {
            message: text,
            conversation_id: get().conversationId,
            date: new Date().toISOString(),
            clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }, { signal: abortController.signal });

          const { response: coachRes, conversationId } = extractCoachResponse(raw);

          // Validate response
          if (!coachRes.summary && !coachRes.mode) {
            throw new Error('Invalid response from AI Coach. Please try again.');
          }

          // Helper to ensure we don't dump JSON into the chat if the AI broke the schema
          const sanitizeSummary = (text: string) => {
              if (!text) return text;
              const trimmed = text.trim();
              if (trimmed.startsWith('{') || trimmed.includes('"options":')) {
                  try {
                      const parsed = JSON.parse(trimmed);
                      return parsed.summary || parsed.text || parsed.response || "I've prepared some options for you.";
                  } catch (e) {
                      if (trimmed.startsWith('{')) return "I've prepared some options for you.";
                      const jsonStart = trimmed.indexOf('{');
                      if (jsonStart > 0) return trimmed.substring(0, jsonStart).trim();
                      return "I've prepared some options for you.";
                  }
              }
              return text.replace(/```json\s*\{[\s\S]*\}\s*```/g, "I've prepared some options for you.")
                         .replace(/```\s*\{[\s\S]*\}\s*```/g, "I've prepared some options for you.");
          };

          const assistantMsg: CoachMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: sanitizeSummary(coachRes.summary || ''),
            mode: coachRes.mode,
            thinking: coachRes.thinking,
            contextUsed: coachRes.context_used,
            options: coachRes.options,
            question: coachRes.question,
            refusal: coachRes.refusal,
            suggestedActions: coachRes.suggested_actions,
            timestamp: Date.now()
          };

          set(state => ({
            messages: [...state.messages, assistantMsg],
            conversationId: conversationId || state.conversationId,
            isLoading: false,
            connectionStatus: 'connected',
            minimalMode: coachRes.mode === 'ask' || (coachRes.thinking?.length === 0),
            suggestedActions: coachRes.suggested_actions || state.suggestedActions,
            canUndo: !!coachRes.undo_token,
            lastUndoToken: coachRes.undo_token || state.lastUndoToken,
            lastSync: Date.now(),
            abortController: null
          }));

          // Auto-execute if mode is 'execute'
          if (coachRes.mode === 'execute' && coachRes.options?.length) {
            const recommended = coachRes.options.find((o: any) => o.recommended) || coachRes.options[0];
            if (recommended) {
              console.log('[Coach] Auto-executing directive:', recommended.title);
              get().applyOption(assistantMsg.id, recommended.id);
            }
          }

          return { success: true };
        } catch (error: any) {
          console.error("Coach Error:", error);
          const errorMessage = error.message || "Connection issue. Please try again.";
          
          if (error.name === 'AbortError') {
            console.log('[Coach] Generation stopped by user');
            return { success: false, error: 'Stopped by user' };
          }

          set(state => ({
            messages: state.messages.filter(m => m.id !== userMsg.id),
            isLoading: false,
            error: errorMessage,
            connectionStatus: 'disconnected',
            lastSync: Date.now(),
            abortController: null
          }));

          return { success: false, error: errorMessage };
        }
      },

      getLatestMessageWithOptions: () => {
        const { messages } = get();
        // Traverse backwards to find the last message with options
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].options && messages[i].options!.length > 0) {
                return messages[i];
            }
        }
        return undefined;
      },

      applyOption: async (messageId: string, optionId: string) => {
        const { messages } = get();
        const msg = messages.find(m => m.id === messageId);
        const option = msg?.options?.find(o => o.id === optionId);
        
        if (!option) {
          console.error('[Coach] Option not found:', optionId);
          return false;
        }

        const ops = (option.patch as any)?.operations || (option.patch as any)?.ops || [];
        if (ops.length === 0) {
          set(state => ({
            messages: state.messages.map(m => 
              m.id === messageId 
                ? { ...m, selected_option_id: optionId, isApplying: false }
                : m
            )
          }));
          return option;
        }

        set(state => ({
          messages: state.messages.map(m => 
            m.id === messageId 
              ? { ...m, selected_option_id: optionId, isApplying: true }
              : m
          )
        }));

        try {
          const batchRes = await fetch('/api/coach/apply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              conversation_id: get().conversationId,
              option_id: optionId,
              patch: option.patch
            })
          });

          const batchData = await batchRes.json();

          if (!batchRes.ok) {
            throw new Error(batchData?.error || "Failed to apply option");
          }

          const partialWarning = batchData.partial
            ? `${batchData.applied_operations} change(s) applied, ${batchData.failed_operations} failed: ${(batchData.errors || []).join('; ')}`
            : undefined;

          set(state => ({
            messages: state.messages.map(m =>
              m.id === messageId
                ? { ...m, selected_option_id: optionId, isApplying: false, undoToken: batchData.undo_token }
                : m
            ),
            canUndo: !!batchData.undo_token,
            lastUndoToken: batchData.undo_token,
            ...(partialWarning ? { error: partialWarning } : {}),
          }));

          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('calendar-refresh'));
          }

          return option;
        } catch (error: any) {
          console.error('[Coach] Apply option error:', error);
          
          set(state => ({
            messages: state.messages.map(m => 
              m.id === messageId 
                ? { ...m, selected_option_id: undefined, isApplying: false }
                : m
            ),
            error: `Failed to apply option: ${error.message}`
          }));

          return false;
        }
      },

      undo: async () => {
        const { lastUndoToken } = get();
        if (!lastUndoToken) return false;

        try {
          const res = await fetch('/api/coach/undo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ undo_token: lastUndoToken })
          });

          if (!res.ok) throw new Error('Undo failed');

          set(state => ({ canUndo: false, lastUndoToken: null }));
          return true;
        } catch (error) {
          console.error('[Coach] Undo error:', error);
          return false;
        }
      },

      clearError: () => set({ error: null, connectionStatus: 'connected' }),

      clearConversation: () => {
        set({ 
          messages: [], 
          conversationId: null,
          canUndo: false,
          lastUndoToken: null,
          lastSync: Date.now()
        });
        
        // Clear localStorage
        localStorage.removeItem(STORAGE_KEY);
      },

      loadProactiveInsight: async () => {
        if (get().checkingProactive) return;
        
        set({ checkingProactive: true });
        
        try {
          const raw = await apiClient.get('/api/coach/proactive') as any;
          const proactiveData = raw?.proactive || (raw?.response && raw.response.proactive) || null;
          set({
            proactiveSuggestion: proactiveData,
            hasLoadedProactive: true,
            checkingProactive: false,
            lastSync: Date.now()
          });
        } catch (error) {
          console.error('[Coach] Proactive insight load error:', error);
          set({ checkingProactive: false });
        }
      },

      loadHistory: async (conversationId?: string) => {
        // Fetch from server to sync state
        try {
          const url = conversationId ? `/api/coach/history?id=${conversationId}` : '/api/coach/history';
          const res = await apiClient.get(url) as any;
          if (res?.success && res?.messages && res.messages.length > 0) {
            set(state => ({
              messages: res.messages.map((m: any) => ({
                id: m.id,
                role: m.role,
                content: m.content,
                mode: m.mode,
                options: m.options,
                selected_option_id: m.selected_option_id,
                timestamp: new Date(m.created_at).getTime()
              })),
              conversationId: res.conversation_id,
              lastSync: Date.now()
            }));
          }
        } catch (error) {
          console.error('[Coach] Failed to load server history:', error);
        }
      },

      dismissProactive: async () => {
        const suggestion = get().proactiveSuggestion;
        if (!suggestion?.dismiss_uid) return;

        try {
          await apiClient.post('/api/coach/dismiss', {
            suggestion_id: suggestion.dismiss_uid
          });
          set({ proactiveSuggestion: null });
        } catch (error) {
          console.error('[Coach] Failed to dismiss proactive:', error);
        }
      },

      actOnProactive: () => {
        const suggestion = get().proactiveSuggestion;
        if (!suggestion) return;
        if (!suggestion?.query) return;
        get().sendMessage(suggestion.query);
        set({ proactiveSuggestion: null });
      },

      retryLastAction: () => {
        const { error, messages } = get();
        if (!error || messages.length === 0) return;
        
        // Retry the last user message
        const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
        if (lastUserMessage) {
          get().sendMessage(lastUserMessage.content);
        }
      }
    }),
    {
      name: STORAGE_KEY,
      partialize: (state): Partial<PersistentCoachData> => ({
        messages: state.messages.slice(-50),
        conversationId: state.conversationId,
        suggestedActions: state.suggestedActions.slice(-20),
        lastSync: Date.now()
      })
    }
  )
);
