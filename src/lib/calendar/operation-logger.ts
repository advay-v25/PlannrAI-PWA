import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Lightweight calendar operation logger.
 * Writes to `calendar_operation_logs` table.
 * Fails silently to avoid breaking calendar operations.
 */
export async function logCalendarOperation(
    supabase: SupabaseClient,
    userId: string,
    operation: string,
    opts: {
        input?: Record<string, any>;
        output?: Record<string, any>;
        durationMs?: number;
        aiModel?: string;
        usedFallback?: boolean;
        source?: string;
        error?: string;
    } = {}
): Promise<void> {
    try {
        await supabase.from('calendar_operation_logs').insert({
            user_id: userId,
            operation,
            input: opts.input || {},
            output: opts.output || {},
            duration_ms: opts.durationMs,
            ai_model: opts.aiModel,
            used_fallback: opts.usedFallback || false,
            source: opts.source || 'system',
            error: opts.error,
        });
    } catch (e) {
        // Never let logging break the caller
        console.warn('[logCalendarOperation] Failed to log:', e);
    }
}

/**
 * Lightweight AI usage logger.
 * Writes to `ai_usage_logs` table.
 */
export async function logAIUsage(
    supabase: SupabaseClient,
    userId: string,
    opts: {
        model: string;
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
        estimatedCostUsd?: number;
        purpose?: string;
        latencyMs?: number;
        success?: boolean;
        error?: string;
    }
): Promise<void> {
    try {
        await supabase.from('ai_usage_logs').insert({
            user_id: userId,
            model: opts.model,
            prompt_tokens: opts.promptTokens || 0,
            completion_tokens: opts.completionTokens || 0,
            total_tokens: opts.totalTokens || 0,
            estimated_cost_usd: opts.estimatedCostUsd || 0,
            purpose: opts.purpose,
            latency_ms: opts.latencyMs,
            success: opts.success !== false,
            error: opts.error,
        });
    } catch (e) {
        console.warn('[logAIUsage] Failed to log:', e);
    }
}
