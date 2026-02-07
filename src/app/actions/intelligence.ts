
'use server';

import { ContextEngine, OptimizationContext } from '@/lib/intelligence/context-engine';
import { createClient } from '@/lib/supabase/server';

/**
 * Server Action to fetch the latest intelligence context for a user.
 * Used by the Home Page dashboard to drive the Intelligence Heartbeat.
 */
export async function getOptimizationContextAction(userId: string): Promise<OptimizationContext | null> {
    try {
        const date = new Date().toISOString().split('T')[0];
        // Ensure we use a clean server-side client
        const supabase = await createClient();
        const context = await ContextEngine.build(userId, date, supabase);

        return context;
    } catch (error) {
        console.error('[IntelligenceAction] Failed to fetch optimization context:', error);
        return null;
    }
}
