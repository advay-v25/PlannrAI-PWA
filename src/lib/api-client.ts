import { createClient } from '@/lib/supabase/client';
import type { ChannelType, AIResponse, Patch } from '@/lib/ai/schemas';
import type { HabitStack, ScheduleBlock, Goal, BlockStatus, Commitment } from '@/types/database';

export type { HabitStack, Commitment };

type ApiOptions = RequestInit & {
    skipAuth?: boolean;
    throwOnError?: boolean;
    clientMode?: 'default' | 'best_effort';
    timeout?: number;
};

export class ApiError extends Error {
    constructor(public status: number, public statusText: string, public data: any) {
        super(`API Error: ${status} ${statusText}`);
        this.name = 'ApiError';
    }
}

const DEFAULT_TIMEOUT = 90000; // 90s — calendar AI needs 55s server + context building overhead
const MAX_RETRIES = 1; // Only 1 retry to avoid cascading abort waits

const getBaseUrl = () => {
    if (typeof window !== 'undefined') {
        return '';
    }
    return process.env.NEXT_PUBLIC_APP_URL || '';
};

async function fetchWithTimeout(resource: RequestInfo, options: RequestInit & { timeout?: number } = {}) {
    const { timeout = DEFAULT_TIMEOUT } = options;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(resource, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (e) {
        clearTimeout(id);
        throw e;
    }
}

export const apiClient = {
    async fetch<T = any>(endpoint: string, options: ApiOptions = {}): Promise<T> {
        const { skipAuth, throwOnError = true, headers, clientMode = 'default', ...rest } = options;
        const finalHeaders: HeadersInit = { 'Content-Type': 'application/json', ...headers };

        // Inject Auth
        if (!skipAuth) {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.access_token) {
                (finalHeaders as any)['Authorization'] = `Bearer ${session.access_token}`;
            }
        }

        const baseUrl = getBaseUrl();
        const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;

        // Best Effort Mode: Short timeout, swallow errors, no retry
        if (clientMode === 'best_effort') {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 1500); // 1.5s timeout

            try {
                const response = await fetch(url, {
                    ...rest,
                    headers: finalHeaders,
                    signal: controller.signal
                });
                clearTimeout(id);
                if (!response.ok) return { success: false, ignored: true } as unknown as T;

                try { return await response.json(); } catch { return {} as T; }
            } catch (e) {
                console.warn(`[BestEffort] Failed ${endpoint}`, e);
                return { success: false, ignored: true } as unknown as T;
            }
        }

        // Default Mode: Retry Logic
        let attempt = 0;
        let lastError: any;

        while (attempt <= MAX_RETRIES) {
            try {
                const response = await fetchWithTimeout(url, {
                    headers: finalHeaders,
                    ...rest
                });

                if (!response.ok) {
                    if (response.status >= 400 && response.status < 500) {
                        // Client error - do not retry
                        if (throwOnError) {
                            let errorData;
                            try {
                                const clone = response.clone();
                                try { 
                                    errorData = await clone.json(); 
                                    if (errorData?.error && !errorData?.message) {
                                        errorData.message = errorData.error;
                                    }
                                } catch { 
                                    errorData = { message: await response.text() }; 
                                }
                            } catch { errorData = { message: 'Unknown error' }; }
                            throw new Error(errorData?.message || `${response.status} ${response.statusText}`);
                        }
                        return {} as T;
                    }
                    // 5xx error -> throw to retry
                    throw new Error(`Server Error: ${response.status}`);
                }

                if (response.status === 204) return {} as T;

                try {
                    const data = await response.json();
                    // Unwrap ApiEnvelope if present
                    if (data && typeof data === 'object' && 'ok' in data && 'data' in data) {
                        return data.data;
                    }
                    return data;
                } catch {
                    return {} as T;
                }

            } catch (error: any) {
                lastError = error;
                const isRetryable = error.message.includes('Server Error') || error.message.includes('fetch');
                // AbortError (timeout) is NOT retryable — the route is just slow, retrying wastes time

                if (!isRetryable || attempt === MAX_RETRIES) {
                    if (throwOnError) {
                        console.error(`API Call Failed [${endpoint}]`, error);
                        throw error;
                    }
                    return {} as T;
                }

                const delay = 1000 * Math.pow(2, attempt);
                // console.warn(`API Retry [${endpoint}] attempt ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`);
                await new Promise(r => setTimeout(r, delay));
                attempt++;
            }
        }
        throw lastError;
    },

    // Shorthands
    async get<T>(endpoint: string, options?: ApiOptions) {
        return this.fetch<T>(endpoint, { ...options, method: 'GET' });
    },

    async post<T>(endpoint: string, body: any, options?: ApiOptions) {
        return this.fetch<T>(endpoint, {
            ...options,
            method: 'POST',
            body: JSON.stringify(body)
        });
    },

    async put<T>(endpoint: string, body: any, options?: ApiOptions) {
        return this.fetch<T>(endpoint, {
            ...options,
            method: 'PUT',
            body: JSON.stringify(body)
        });
    },

    async delete<T>(endpoint: string, body?: any, options?: ApiOptions) {
        return this.fetch<T>(endpoint, {
            ...options,
            method: 'DELETE',
            body: body ? JSON.stringify(body) : undefined
        });
    },

    // Unified AI & Patch Pipeline
    get coach() {
        return {
            getProactiveSuggestion: () => this.get<{ has_suggestion: boolean; suggestion?: any }>('/api/coach/proactive')
        };
    },

    get ai() {
        return {
            execute: (data: { channel: ChannelType; input: string; context?: any; limits?: any; twoPass?: boolean; maxTokens?: number }) =>
                this.post<AIResponse>('/api/ai/execute', data),
        };
    },

    get patch() {
        return {
            apply: (patch: Patch, source: string = 'ai_assist') =>
                this.post<{ success: boolean; results: any; versionId?: string; updatedBlocks?: any[] }>('/api/patch/apply', { patch, source }),
            undo: () =>
                this.post<{ success: boolean; updatedBlocks?: any[] }>('/api/patch/undo', {}),
        };
    },

    // Domain APIs
    get schedule() {
        return {
            // New Summary Endpoint (Authoritative)
            summary: (start: string, end: string) =>
                this.get<{
                    profile: any;
                    blocks: (ScheduleBlock & { goal?: Goal })[];
                    goals: Goal[];
                    commitments: Commitment[];
                    habitStacks: HabitStack[];
                    inbox: ScheduleBlock[];
                }>(`/api/calendar/summary?start=${start}&end=${end}`),

            // Legacy list (redirect to summary or keep for compatibility if needed)
            list: (start: string, end: string) =>
                this.get<{ blocks: (ScheduleBlock & { goal?: Goal })[] }>(`/api/schedule?start=${start}&end=${end}`),

            // Mutations via apply-patch (Single Source of Truth)
            createBlock: (data: { date: string; start_time: string; end_time: string; goal_id?: string | null; context?: string | null }) =>
                this.post('/api/calendar/add-block', { block: data }), // Use add-block for conflict detection

            updateBlock: (id: string, updates: Record<string, any>) =>
                this.post('/api/calendar/apply-schedule', {
                    action: 'manual',
                    patch: { update: [{ id, changes: updates }] }
                }),

            moveBlock: (id: string, newDate: string, newStart: string, newEnd: string, resolution_strategy?: string) =>
                this.post('/api/calendar/move-block', { block_id: id, new_date: newDate, new_start_time: newStart, new_end_time: newEnd, resolution_strategy }),

            deleteBlock: (id: string) =>
                this.post('/api/calendar/apply-schedule', {
                    action: 'manual',
                    patch: { remove: [id] }
                }),

            updateStatus: (id: string, status: BlockStatus) =>
                this.post('/api/calendar/apply-schedule', {
                    action: 'manual',
                    patch: { update: [{ id, changes: { status } }] }
                }),

            // AI Features
            planWeek: (data: { start_date: string; mode: string; allow_weekend: boolean }) =>
                this.post('/api/calendar/plan-week', data, { timeout: 180000 }), // 3 minutes

            optimizeDay: (data: { date: string; focus?: string }) =>
                this.post('/api/calendar/optimize-day', data, { timeout: 120000 }), // 2 minutes

            autoPlace: (data: { block_id: string; duration_minutes: number; target_date: string }) =>
                this.post('/api/calendar/auto-place', data),

            addInboxItem: (data: { title: string; estimated_minutes: number }) =>
                this.post('/api/calendar/inbox', data),

            deleteCommitment: (commitmentId: string) =>
                this.delete(`/api/anchors?id=${commitmentId}`),

            createCommitment: (data: { title: string; start_time: string; end_time: string; days_of_week: number[] }) =>
                this.post<{ commitment: Commitment }>('/api/anchors', data),

            updateBlockStatus: (data: {
                block_id: string;
                status: 'planned' | 'in_progress' | 'done' | 'missed' | 'cancelled' | 'partial';
                actual_start_time?: string;
                actual_end_time?: string;
                notes?: string;
            }) => this.post('/api/calendar/block-status', data),
        };
    },

    get habitStacks() {
        return {
            list: () => this.get<{ stacks: HabitStack[] }>('/api/habit-stacks'),
            create: (data: { trigger_habit: string; action_habit: string; goal_id?: string; action_duration_mins: number }) =>
                this.post<{ stack: HabitStack }>('/api/habit-stacks', data),
            complete: (id: string) =>
                this.put<{ stack: HabitStack; streakInfo: { isNewRecord: boolean } }>('/api/habit-stacks', { id, mark_complete: true }),
            delete: (id: string) => this.delete(`/api/habit-stacks/${id}`)
        };
    },

    get anchors() {
        return {
            create: (data: { title: string; start_time: string; end_time: string; days_of_week: number[] }) =>
                this.post<{ commitment: Commitment }>('/api/anchors', data),
            delete: (id: string) => this.delete(`/api/anchors?id=${id}`)
        };
    },

    get behavior() {
        return {
            logSignal: (action: string, meta: any = {}) => {
                // Fire and forget - use separate promise chain to not await
                return apiClient.post('/api/behavior/signal', { action, meta }, { clientMode: 'best_effort' })
                    .catch(e => ({ success: false, ignored: true }));
            }
        };
    },

    async checkHealth() {
        try {
            return await this.get<{ ok: boolean; status: string }>('/api/health', { skipAuth: true, clientMode: 'best_effort' });
        } catch (e) {
            return { ok: false, status: 'offline' };
        }
    }
};

// Legacy exports
export const scheduleApi = apiClient.schedule;
export const habitStacksApi = apiClient.habitStacks;
export const anchorsApi = apiClient.anchors;
