import { createClient } from '@/lib/supabase/client';
import type { ChannelType, AIResponse, Patch } from '@/lib/ai/schemas';

type ApiOptions = RequestInit & {
    skipAuth?: boolean;
    throwOnError?: boolean;
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
        // Browser context
        return ''; // Next.js handles relative /api routes
    }
    // Server context (e.g. for absolute URLs if needed)
    return process.env.NEXT_PUBLIC_APP_URL || '';
};

async function fetchWithTimeout(resource: RequestInfo, options: RequestInit & { timeout?: number } = {}) {
    const { timeout = DEFAULT_TIMEOUT } = options;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(resource, {
        ...options,
        signal: controller.signal
    });
    clearTimeout(id);
    return response;
}

export const apiClient = {
    async fetch<T = any>(endpoint: string, options: ApiOptions = {}): Promise<T> {
        const { skipAuth, throwOnError = true, headers, ...rest } = options;
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

        let attempt = 0;
        let lastError: any;

        while (attempt <= MAX_RETRIES) {
            try {
                const response = await fetchWithTimeout(url, {
                    headers: finalHeaders,
                    ...rest
                });

                if (!response.ok) {
                    // Don't retry client errors (4xx), only 5xx or network
                    if (response.status >= 400 && response.status < 500) {
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

                    if (throwOnError) {
                        let errorData;
                        try {
                            const clone = response.clone();
                            try { errorData = await clone.json(); } catch { errorData = { message: await response.text() }; }
                        } catch { errorData = { message: 'Unknown error' }; }
                        throw new ApiError(response.status, response.statusText, errorData);
                    }
                }

                if (response.status === 204) return {} as T;

                try {
                    return await response.json();
                } catch {
                    return {} as T;
                }

            } catch (error: any) {
                lastError = error;
                // Retry only if network error or 5xx (ApiError with status >= 500)
                const isRetryable = error.name === 'AbortError' || (error instanceof ApiError && error.status >= 500) || error.message.includes('fetch');

                if (!isRetryable || attempt === MAX_RETRIES) {
                    console.error(`API Call Failed [${endpoint}] (Attempt ${attempt + 1})`, error);
                    throw error;
                }

                console.warn(`API Retry [${endpoint}] attempt ${attempt + 1}/${MAX_RETRIES}`);
                await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); // Backoff
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
            list: (start: string, end: string) =>
                this.get<{ blocks: (ScheduleBlock & { goal?: Goal })[] }>(`/api/schedule?start=${start}&end=${end}`),
            createBlock: (data: { date: string; start_time: string; end_time: string; goal_id?: string | null; context?: string | null }) =>
                this.post<{ block: ScheduleBlock }>('/api/schedule', data),
            updateBlock: (id: string, updates: Record<string, any>) =>
                this.put<{ block: ScheduleBlock }>('/api/schedule', { id, ...updates }),
            deleteBlock: (id: string) =>
                this.delete<{ success: boolean }>('/api/schedule', { id }),
            updateStatus: (id: string, status: BlockStatus) =>
                this.put<{ block: ScheduleBlock }>('/api/schedule/status', { id, status }),
            sync: (date: string, blocks: Partial<ScheduleBlock>[]) =>
                this.post<{ success: boolean; blocks: ScheduleBlock[] }>('/api/schedule/sync', { date, blocks }),
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
            logSignal: (action: string, meta: any = {}) =>
                this.post('/api/behavior/signal', { action, meta })
        };
    },

    async checkHealth() {
        try {
            const data = await this.get<{ ok: boolean; env: string }>('/api/health', { skipAuth: true });
            return data;
        } catch (e) {
            console.error('Health Check Failed:', e);
            return { ok: false, env: 'unknown' };
        }
    }
};

// --- DOMAIN APIS ---

import type { HabitStack, ScheduleBlock, Goal, BlockStatus, Commitment } from '@/types/database';

export type { HabitStack, Commitment };

// Keep legacy exports for compatibility if preferred
export const scheduleApi = apiClient.schedule;
export const habitStacksApi = apiClient.habitStacks;
export const anchorsApi = apiClient.anchors;
