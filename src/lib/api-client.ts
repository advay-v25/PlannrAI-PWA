/**
 * PlannrAI - API Client
 * Centralized API communication with error handling, retries, and type safety
 */

import type { Goal, Profile } from '@/types/database';

// Types for API responses
interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
}

interface HabitStack {
    id: string;
    user_id: string;
    goal_id: string | null;
    trigger_habit: string;
    action_habit: string;
    trigger_time: string | null;
    action_duration_mins: number;
    current_streak: number;
    longest_streak: number;
    last_completed: string | null;
    total_completions: number;
    grace_days_used: number;
    max_grace_days: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

interface DailyLog {
    id: string;
    user_id: string;
    log_date: string;
    energy_level: number;
    mood: string | null;
    wins: string[];
    challenges: string[];
    gratitude: string[];
    signals: Array<{ type: string; content: string }>;
}

interface BlockLog {
    id: string;
    block_id: string;
    user_id: string;
    log_date: string;
    status: 'pending' | 'done' | 'partial' | 'missed' | 'skipped';
    reason: string | null;
    deviation_type: 'unavoidable' | 'structural' | 'energy' | 'skill' | 'avoidance' | null;
    ai_analysis: Record<string, unknown> | null;
}

// API base configuration
const API_BASE = '/api';

/**
 * Generic API fetch with error handling
 */
async function apiFetch<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<ApiResponse<T>> {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
        });

        const data = await response.json();

        if (!response.ok) {
            return {
                success: false,
                error: data.error || `Request failed with status ${response.status}`,
            };
        }

        return { success: true, data };
    } catch (error) {
        console.error('API error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Network error',
        };
    }
}

// =====================================================
// GOALS API
// =====================================================

export const goalsApi = {
    async list(parentId?: string | null): Promise<ApiResponse<{ goals: Goal[] }>> {
        const params = parentId !== undefined
            ? `?parent_id=${parentId || 'null'}`
            : '';
        return apiFetch(`/goals${params}`);
    },

    async create(goal: {
        title: string;
        category: 'mind' | 'body' | 'future';
        minutes_per_day?: number;
        importance?: 'low' | 'medium' | 'high';
        parent_id?: string;
        constraints?: Record<string, unknown>;
        non_negotiables?: string[];
    }): Promise<ApiResponse<{ goal: Goal }>> {
        return apiFetch('/goals', {
            method: 'POST',
            body: JSON.stringify(goal),
        });
    },

    async update(id: string, updates: Partial<Goal>): Promise<ApiResponse<{ goal: Goal }>> {
        return apiFetch('/goals', {
            method: 'PUT',
            body: JSON.stringify({ id, ...updates }),
        });
    },

    async delete(id: string): Promise<ApiResponse<{ success: boolean }>> {
        return apiFetch('/goals', {
            method: 'DELETE',
            body: JSON.stringify({ id }),
        });
    },

    async generateRoutine(goalId: string): Promise<ApiResponse<{ translation: unknown; source: string }>> {
        return apiFetch('/ai/translate', {
            method: 'POST',
            body: JSON.stringify({ goal_id: goalId }),
        });
    },
};

// =====================================================
// HABIT STACKS API
// =====================================================

export const habitStacksApi = {
    async list(): Promise<ApiResponse<{ stacks: HabitStack[] }>> {
        return apiFetch('/habit-stacks');
    },

    async create(stack: {
        trigger_habit: string;
        action_habit: string;
        goal_id?: string;
        trigger_time?: string;
        action_duration_mins?: number;
    }): Promise<ApiResponse<{ stack: HabitStack }>> {
        return apiFetch('/habit-stacks', {
            method: 'POST',
            body: JSON.stringify(stack),
        });
    },

    async complete(id: string): Promise<ApiResponse<{
        stack: HabitStack;
        streakInfo?: { isNewRecord: boolean; usedGrace: boolean }
    }>> {
        return apiFetch('/habit-stacks', {
            method: 'PUT',
            body: JSON.stringify({ id, mark_complete: true }),
        });
    },

    async update(id: string, updates: Partial<HabitStack>): Promise<ApiResponse<{ stack: HabitStack }>> {
        return apiFetch('/habit-stacks', {
            method: 'PUT',
            body: JSON.stringify({ id, ...updates }),
        });
    },

    async delete(id: string): Promise<ApiResponse<{ success: boolean }>> {
        return apiFetch('/habit-stacks', {
            method: 'DELETE',
            body: JSON.stringify({ id }),
        });
    },
};

// =====================================================
// COACH API
// =====================================================

export const coachApi = {
    async sendMessage(
        message: string,
        lowEnergyMode = false
    ): Promise<ApiResponse<{
        response: {
            structured?: {
                facts: string;
                interpretation: string;
                options: string[];
                permissionCheck: string;
            };
            formatted: string;
            isCrisisResponse?: boolean;
        };
    }>> {
        return apiFetch('/coach', {
            method: 'POST',
            body: JSON.stringify({ message, lowEnergyMode }),
        });
    },
};

// =====================================================
// BRAIN DUMP API
// =====================================================

export const brainDumpApi = {
    async list(): Promise<ApiResponse<{ dumps: Array<{ id: string; content: string; created_at: string }> }>> {
        return apiFetch('/brain-dump');
    },

    async create(content: string): Promise<ApiResponse<{ dump: { id: string; content: string; created_at: string } }>> {
        return apiFetch('/brain-dump', {
            method: 'POST',
            body: JSON.stringify({ content }),
        });
    },

    async process(dumpId: string): Promise<ApiResponse<{ signals: unknown[]; constraints: unknown[] }>> {
        return apiFetch('/brain-dump/process', {
            method: 'POST',
            body: JSON.stringify({ dump_id: dumpId }),
        });
    },
};

// =====================================================
// SCHEDULE API
// =====================================================

export const scheduleApi = {
    async getForDate(date: string): Promise<ApiResponse<{ blocks: unknown[] }>> {
        return apiFetch(`/schedule?date=${date}`);
    },

    async createBlock(block: {
        goal_id?: string;
        date: string;
        start_time: string;
        end_time: string;
        context?: string;
    }): Promise<ApiResponse<{ block: unknown }>> {
        return apiFetch('/schedule', {
            method: 'POST',
            body: JSON.stringify(block),
        });
    },

    async updateBlock(id: string, updates: {
        status?: 'planned' | 'done' | 'partial' | 'missed' | 'skipped';
        context?: string;
    }): Promise<ApiResponse<{ block: unknown }>> {
        return apiFetch('/schedule', {
            method: 'PUT',
            body: JSON.stringify({ id, ...updates }),
        });
    },
};

// =====================================================
// PROFILE API
// =====================================================

export const profileApi = {
    async get(): Promise<ApiResponse<{ profile: Profile }>> {
        return apiFetch('/profile');
    },

    async update(updates: Partial<Profile>): Promise<ApiResponse<{ profile: Profile }>> {
        return apiFetch('/profile', {
            method: 'PUT',
            body: JSON.stringify(updates),
        });
    },
};

// =====================================================
// WEEKLY REVIEW API
// =====================================================

export const weeklyReviewApi = {
    async generate(): Promise<ApiResponse<{
        review: {
            energyTrend: string;
            stressTrend: string;
            frictionPatterns: string[];
            wins: string[];
            suggestedAdjustment: string;
        };
    }>> {
        return apiFetch('/weekly-review/generate', {
            method: 'POST',
        });
    },
};

// =====================================================
// DEVIATION API
// =====================================================

type DeviationType = 'unavoidable' | 'structural' | 'energy' | 'skill' | 'avoidance';

interface DeviationClassification {
    type: DeviationType;
    confidence: number;
    explanation: string;
    suggestions: string[];
    rootCause?: string;
    patternMatch?: string;
}

export const deviationApi = {
    async classify(blockId: string, reason: string, useAi = true): Promise<ApiResponse<{
        classification: DeviationClassification;
        log: BlockLog;
        message: string;
    }>> {
        return apiFetch('/deviation', {
            method: 'POST',
            body: JSON.stringify({
                block_id: blockId,
                reason,
                use_ai: useAi,
            }),
        });
    },

    async list(options?: {
        startDate?: string;
        endDate?: string;
        type?: DeviationType;
    }): Promise<ApiResponse<{
        logs: BlockLog[];
        patterns: {
            byType: Record<DeviationType, number>;
            total: number;
            mostCommon: string;
        };
    }>> {
        const params = new URLSearchParams();
        if (options?.startDate) params.set('start_date', options.startDate);
        if (options?.endDate) params.set('end_date', options.endDate);
        if (options?.type) params.set('type', options.type);

        const queryString = params.toString();
        return apiFetch(`/deviation${queryString ? `?${queryString}` : ''}`);
    },
};

// =====================================================
// NEXT MOVE API
// =====================================================

interface NextMoveOption {
    id: string;
    type: string;
    label: string;
    description: string;
    duration: number;
    icon: string;
    reasoning?: string;
    priority: 'high' | 'medium' | 'low';
    tradeoff?: string;
}

interface NextMoveGuidance {
    message: string;
    options: NextMoveOption[];
    context: {
        energyLevel: number;
        timeOfDay: string;
        pendingBlocks: number;
        suggestedAction: 'continue' | 'shift' | 'rest';
    };
}

export const nextMoveApi = {
    async getGuidance(energyLevel?: number): Promise<ApiResponse<{ guidance: NextMoveGuidance }>> {
        const params = energyLevel ? `?energy_level=${energyLevel}` : '';
        return apiFetch(`/next-move${params}`);
    },

    async recordAction(action: 'selected' | 'dismissed' | 'snoozed', optionId?: string, optionType?: string): Promise<ApiResponse<{
        recorded: boolean;
        action: string;
        message: string;
    }>> {
        return apiFetch('/next-move', {
            method: 'POST',
            body: JSON.stringify({
                action,
                option_id: optionId,
                option_type: optionType,
            }),
        });
    },
};

// =====================================================
// AI API - Goal Interpretation & Week Planning
// =====================================================

interface GoalInterpretation {
    interpretation: {
        understanding: string;
        timeframe: string;
        complexity: string;
        success_looks_like: string;
    };
    subtasks: Array<{
        id: string;
        title: string;
        description: string;
        duration_mins: number;
        frequency: 'daily' | 'weekly' | 'once';
        priority: 'high' | 'medium' | 'low';
        order: number;
    }>;
    routine: {
        type: string;
        steps: Array<{ order: number; action: string; duration_mins: number; best_time: string }>;
    };
    weekly_schedule: Record<string, Array<{ time: string; duration_mins: number; focus: string }>>;
    milestones: Array<{ week: number; goal: string; metric: string }>;
    habit_suggestions: Array<{ title: string; trigger: string; duration_mins: number; why: string }>;
    adjustments: {
        lowEnergy: string;
        timeConstrained: string;
        struggling: string;
    };
}

interface WeekPlan {
    schedule: Record<string, Array<{
        time: string;
        end_time: string;
        title: string;
        goal_id?: string;
        type?: 'goal' | 'break' | 'buffer';
    }>>;
    reasoning: {
        overview: string;
        energy_considerations: string;
        balance: string;
    };
    flexibility: Array<{ day: string; time: string; moveable: boolean; alternatives: string[] }>;
    tips: string[];
}

export const aiApi = {
    async interpretGoal(goalId: string, regenerate = false): Promise<ApiResponse<{
        interpretation: GoalInterpretation;
        source: 'ai' | 'template' | 'cached';
    }>> {
        return apiFetch('/ai/translate', {
            method: 'POST',
            body: JSON.stringify({ goal_id: goalId, regenerate }),
        });
    },

    async planWeek(weekStart?: string): Promise<ApiResponse<{
        plan: WeekPlan;
        source: 'ai' | 'template';
        week_start: string;
    }>> {
        return apiFetch('/ai/plan-week', {
            method: 'POST',
            body: JSON.stringify({ week_start: weekStart }),
        });
    },

    async applyWeekPlan(plan: WeekPlan, weekStart: string): Promise<ApiResponse<{
        created: number;
        blocks: unknown[];
        message: string;
    }>> {
        return apiFetch('/ai/plan-week', {
            method: 'PUT',
            body: JSON.stringify({ plan, week_start: weekStart }),
        });
    },
};

// Export types for use in components
export type { HabitStack, DailyLog, BlockLog, DeviationClassification, DeviationType, NextMoveOption, NextMoveGuidance, GoalInterpretation, WeekPlan };

