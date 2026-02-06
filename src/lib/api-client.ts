import { createClient } from '@/lib/supabase/client';

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

        let attempt = 0;
        let lastError: any;

        while (attempt <= MAX_RETRIES) {
            try {
                const response = await fetchWithTimeout(endpoint, {
                    headers: finalHeaders,
                    ...rest
                });

                if (!response.ok) {
                    // Don't retry client errors (4xx), only 5xx or network
                    if (response.status >= 400 && response.status < 500) {
                        // Throw immediately
                        if (throwOnError) {
                            let errorData;
                            try { errorData = await response.json(); } catch { errorData = { message: await response.text() }; }
                            throw new ApiError(response.status, response.statusText, errorData);
                        }
                        return {} as T; // Should we return empty if throwOnError false? Yes per existing contract
                    }

                    // If 5xx, throw to trigger retry
                    if (throwOnError) {
                        let errorData;
                        try { errorData = await response.json(); } catch { errorData = { message: await response.text() }; }
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

    async delete<T>(endpoint: string, options?: ApiOptions) {
        return this.fetch<T>(endpoint, { ...options, method: 'DELETE' });
    }
};

// --- DOMAIN APIS ---

import type { HabitStack } from '@/types/database';

export type { HabitStack };

export const habitStacksApi = {
    list: () => apiClient.get<{ success: boolean; data: { stacks: HabitStack[] } }>('/api/habits/stacks'),

    create: (data: { trigger_habit: string; action_habit: string; goal_id?: string; action_duration_mins: number }) =>
        apiClient.post<{ success: boolean; data: { stack: HabitStack } }>('/api/habits/stacks', data),

    complete: (id: string) =>
        apiClient.post<{ success: boolean; data: { stack: HabitStack; streakInfo: { isNewRecord: boolean } } }>(`/api/habits/stacks/${id}/complete`, {}),

    delete: (id: string) => apiClient.delete(`/api/habits/stacks/${id}`)
};

export const scheduleApi = {
    updateBlock: (id: string, updates: Record<string, any>) =>
        apiClient.put<any>('/api/schedule', { id, ...updates }),
};
