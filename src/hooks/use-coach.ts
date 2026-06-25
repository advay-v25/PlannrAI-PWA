'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiClient } from '@/lib/api-client';
import type { CoachResponse, ProposedOption, MutationLedger, ProactiveSuggestion } from '@/types/coach-v4';

export interface CoachMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  mode?: string;
  thinking?: string[];
  contextUsed?: string[];
  options?: ProposedOption[];
  execution_mode?: 'AUTO_EXECUTE' | 'PROPOSE_OPTIONS';
  executed_ledger?: MutationLedger | null;
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
  applyOption: (messageId: string, optionId: string) => Promise<ProposedOption | boolean>;
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
  // If raw is a string, try parsing it
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return { response: { dialogue_response: raw, mode: 'chat', execution_mode: 'AUTO_EXECUTE', system_state_flag: 'NORMAL' } };
    }
  }

  // Format: { success, conversation_id, response }
  if (raw?.response) {
    if (typeof raw.response === 'string') {
      try {
        const parsed = JSON.parse(raw.response);
        return { response: parsed, conversationId: raw.conversation_id };
      } catch {
        return { response: { dialogue_response: raw.response, execution_mode: 'AUTO_EXECUTE', system_state_flag: 'NORMAL' }, conversationId: raw.conversation_id };
      }
    }
    return { response: raw.response, conversationId: raw.conversation_id };
  }
  
  // Already unwrapped CoachResponse (has dialogue_response directly)
  if (raw?.dialogue_response || raw?.execution_mode || raw?.summary || raw?.mode) {
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

      stopGenerating: async () => {
        const { abortController, messages, conversationId } = get();
        if (abortController) {
          abortController.abort();
          
          const cancelMsg: CoachMessage = {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: 'Prompt cancelled.',
              timestamp: Date.now()
          };
          
          set({
            isLoading: false,
            abortController: null,
            messages: [...messages, cancelMsg]
          });
          
          // If this was the first turn, delete the transient conversation so it doesn't save
          if (messages.length <= 1 && conversationId) {
              try {
                  await apiClient.delete(`/api/coach/conversations?id=${conversationId}`);
              } catch (e) {
                  console.error('Failed to delete cancelled conversation', e);
              }
          }
          
          return 'Prompt cancelled.';
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
            content: sanitizeSummary(coachRes.dialogue_response || coachRes.summary || ''),
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
            clientDate: new Date().toLocaleDateString('en-CA'),
            clientTime: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
            clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }, { signal: abortController.signal });

          const { response: coachRes, conversationId } = extractCoachResponse(raw);

          // Validate response
          if (!coachRes.dialogue_response && !coachRes.execution_mode && !coachRes.summary && !coachRes.mode) {
            console.error('[Coach Validation Failed] RAW:', raw, 'COACHRES:', coachRes);
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
            content: sanitizeSummary(coachRes.dialogue_response || coachRes.summary || ''),
            mode: coachRes.execution_mode || coachRes.mode,
            execution_mode: coachRes.execution_mode,
            executed_ledger: coachRes.executed_ledger,
            thinking: coachRes.thinking,
            contextUsed: coachRes.context_used,
            options: coachRes.proposed_options || coachRes.options,
            suggestedActions: coachRes.contextual_options || coachRes.suggested_actions,
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

          // Auto-execute if mode is 'AUTO_EXECUTE' and we have an executed ledger
          if ((coachRes.execution_mode === 'AUTO_EXECUTE' || coachRes.mode === 'execute') && coachRes.executed_ledger) {
              console.log('[Coach] Auto-executing ledger');
              // Create a dummy option out of the executed ledger to pass to applyOption
              const dummyOption: ProposedOption = {
                  id: 'auto_execute',
                  title: 'Auto Execute',
                  impact: 'Auto Executed',
                  ledger: coachRes.executed_ledger
              };
              assistantMsg.options = [dummyOption];
              get().applyOption(assistantMsg.id, 'auto_execute');
          } else if (coachRes.mode === 'execute' && (coachRes.proposed_options?.length || coachRes.options?.length)) {
            const opts = coachRes.proposed_options || coachRes.options;
            const recommended = opts.find((o: any) => o.recommended) || opts[0];
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

        const ops = (option.ledger?.ops) || (option as any).patch?.operations || (option as any).patch?.ops || [];


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
              patch: { operations: option.ledger?.ops || [] },
              option_text: JSON.stringify({
                title: option.title,
                description: option.description,
                impact: option.impact,
                ledger: option.ledger
              })
            })
          });

          const batchData = await batchRes.json();

          if (!batchRes.ok) {
            throw new Error(batchData?.error || "Failed to apply option");
          }

          const partialWarning = batchData.partial
            ? `${batchData.applied_operations} change(s) applied, ${batchData.failed_operations} failed: ${(batchData.errors || []).join('; ')}`
            : undefined;

          let finalMsg = `Changes applied: ${option.impact}`;
          let blockTitle = 'The';
          let targetTime = '';
          let targetDay = '';
          let targetDateStr = '';
          const titleMatch = option.impact?.match(/Moved "(.*?)"/i);
          if (titleMatch) blockTitle = titleMatch[1];
          const moveOp = ops.find((o: any) => o.type === 'move_block' || o.type === 'move' || o.op === 'move_event');
          if (moveOp) {
              const newStart = moveOp.new_start || moveOp.to_start || moveOp.start_time;
              if (newStart) targetTime = newStart.substring(0, 5);
              const newDate = moveOp.new_date || moveOp.date;
              if (newDate && newDate.includes('-')) {
                  const [yyyy, mm, dd] = newDate.split('-');
                  const dObj = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
                  const dWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dObj.getDay()];
                  targetDay = dWeek;
                  targetDateStr = `${dd}/${mm}`;
              }
          }
          if (targetTime && targetDay && targetDateStr) {
              finalMsg = `Changes applied: ${blockTitle} block moved to ${targetTime}, on ${targetDay}, on ${targetDateStr}.`;
          }

          set(state => ({
            messages: [
              ...state.messages.map(m =>
                m.id === messageId
                  ? { ...m, selected_option_id: optionId, isApplying: false, undoToken: batchData.undo_token }
                  : m
              ),
              {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: finalMsg,
                timestamp: Date.now()
              } as any
            ],
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
          set(state => ({ 
            canUndo: false, 
            lastUndoToken: null,
            messages: [
              ...state.messages,
              {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: 'Change reverted',
                timestamp: new Date().toISOString()
              }
            ]
          }));
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
          const proactiveData = raw?.suggestion || (raw?.response && raw.response.suggestion) || null;
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
            let mapped = res.messages.map((m: any) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              mode: m.mode,
              execution_mode: m.execution_mode,
              executed_ledger: m.executed_ledger,
              suggestedActions: m.suggested_actions,
              undoToken: m.undo_token,
              options: m.options,
              selected_option_id: m.selected_option_id,
              timestamp: new Date(m.created_at).getTime()
            }));

            set(state => ({
              messages: mapped,
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
