import { createClient } from '@/lib/supabase/client';
import type { ChannelType, AIResponse, Patch } from '@/lib/ai/schemas';
import type { HabitStack, ScheduleBlock, Goal, BlockStatus, Commitment } from '@/types/database';

export type { HabitStack, Commitment };

type ApiOptions = RequestInit & {
    skipAuth?: boolean;
    throwOnError?: boolean;
    clientMode?: 'default' | 'best_effort';
};

export class ApiError extends Error {
    constructor(public status: number, public statusText: string, public data: any) {
        super(`API Error: ${status} ${statusText}`);
        this.name = 'ApiError';
    }
}

const DEFAULT_TIMEOUT = 15000;
const MAX_RETRIES = 2;

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
                                try { errorData = await clone.json(); } catch { errorData = { message: await response.text() }; }
                            } catch { errorData = { message: 'Unknown error' }; }
                            throw new ApiError(response.status, response.statusText, errorData);
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
                const isRetryable = error.name === 'AbortError' || error.message.includes('Server Error') || error.message.includes('fetch');

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
                }>(`/api/calendar/summary?start=${start}&end=${end}`),

            // Legacy list (redirect to summary or keep for compatibility if needed)
            list: (start: string, end: string) =>
                this.get<{ blocks: (ScheduleBlock & { goal?: Goal })[] }>(`/api/schedule?start=${start}&end=${end}`),

            // Mutations via apply-patch (Single Source of Truth)
            createBlock: (data: { date: string; start_time: string; end_time: string; goal_id?: string | null; context?: string | null }) =>
                this.post('/api/calendar/add-block', { block: data }), // Use add-block for conflict detection

            updateBlock: (id: string, updates: Record<string, any>) =>
                this.post('/api/schedule/apply-patch', {
                    patch: {
                        ops: [{ op: 'update_event', event_id: id, payload: updates }]
                    },
                    source: 'manual_update'
                }),

            moveBlock: (id: string, newDate: string, newStart: string, newEnd: string) =>
                this.post('/api/calendar/move-block', { block_id: id, new_date: newDate, new_start_time: newStart, new_end_time: newEnd }),

            deleteBlock: (id: string) =>
                this.post('/api/schedule/apply-patch', {
                    patch: {
                        ops: [{ op: 'delete_event', event_id: id }]
                    },
                    source: 'manual_delete'
                }),

            updateStatus: (id: string, status: BlockStatus) =>
                this.post('/api/schedule/apply-patch', {
                    patch: {
                        ops: [{ op: 'update_event', event_id: id, payload: { status } }]
                    },
                    source: 'status_change'
                }),

            // AI Features
            planWeek: (data: { start_date: string; mode: string; allow_weekend: boolean }) =>
                this.post('/api/calendar/plan-week', data),

            optimizeDay: (data: { date: string; focus?: string }) =>
                this.post('/api/calendar/optimize-day', data),
        };
    },

    get habitStacks() {
        return {
            list: () => this.get<{ success: boolean; data: { stacks: HabitStack[] } }>('/api/habit-stacks'),
            create: (data: { trigger_habit: string; action_habit: string; goal_id?: string; action_duration_mins: number }) =>
                this.post<{ success: boolean; data: { stack: HabitStack } }>('/api/habit-stacks', data),
            complete: (id: string) =>
                this.put<{ success: boolean; data: { stack: HabitStack; streakInfo: { isNewRecord: boolean } } }>('/api/habit-stacks', { id, mark_complete: true }),
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
