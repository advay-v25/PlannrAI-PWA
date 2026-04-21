'use server';

import { createClient } from '@/lib/supabase/server';

interface LeverAction {
    type: 'update_goal' | 'update_preference' | 'update_schedule';
    payload: any;
    description?: string;
}
import { revalidatePath } from 'next/cache';

export async function applyLeverAction(action: LeverAction) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) throw new Error("Unauthorized");

    console.log(`[Lever] Applying action: ${action.type}`, action.payload);

    try {
        const { PatchService } = await import('@/lib/services/patch-service');

        // Normalize any action into a Patch format for PatchService
        const patch: any = {
            ops: [],
            scope: 'week',
            reason: action.description || `Lever: ${action.type}`
        };

        if (action.type === 'update_schedule') {
            patch.ops = action.payload?.ops || action.payload?.patch?.ops || [];
        } else if (action.type === 'update_goal') {
            patch.ops = [{
                op: 'update_goal',
                goal_id: action.payload.goal_id,
                payload: action.payload.updates
            }];
        } else if (action.type === 'update_preference') {
            patch.ops = [{
                op: 'update_settings',
                payload: { [action.payload.preference_key]: action.payload.value }
            }];
        }

        if (patch.ops.length > 0) {
            await PatchService.applyPatch(user.id, patch, supabase as any);
        }

        // Log to Memory (Fact)
        await supabase.from('memory_facts').insert({
            user_id: user.id,
            key: 'lever_accepted',
            value: action.description,
            kind: 'pattern', // Levers often establish new patterns
            confidence: 1.0,
            source_event_id: 'weekly_review' // abusing source_event_id a bit, or use a metadata field if exists
        });

        revalidatePath('/app');
        return { success: true };
    } catch (error) {
        console.error("Failed to apply lever:", error);
        throw new Error("Failed to apply change");
    }
}
