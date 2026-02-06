'use server';

import { createClient } from '@/lib/supabase/server';
import { LeverAction } from '@/types/database';
import { revalidatePath } from 'next/cache';

export async function applyLeverAction(action: LeverAction) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) throw new Error("Unauthorized");

    console.log(`[Lever] Applying action: ${action.type}`, action.payload);

    try {
        switch (action.type) {
            case 'update_goal':
                // Payload: { goal_id: string, updates: Partial<Goal> }
                const goalPayload = action.payload;
                await supabase.from('goals')
                    .update(goalPayload.updates)
                    .eq('id', goalPayload.goal_id)
                    .eq('user_id', user.id);
                break;

            case 'update_preference':
                // Payload: { preference_key: string, value: any }
                // Need to handle nested JSON updates if key is 'body_preferences' etc.
                const prefPayload = action.payload;

                // Construct update object dynamically
                const updateObj: Record<string, any> = {};

                // Handle nested keys if notation is 'body_preferences.duration_mins' (simple implementation)
                // For now, assume top-level or specific known columns
                updateObj[prefPayload.preference_key] = prefPayload.value;

                await supabase.from('profiles')
                    .update(updateObj)
                    .eq('id', user.id);
                break;

            case 'update_schedule':
                // Payload: { updates: ... } - Implementation depends on specific schedule changes
                // Phase 7 MVP: Maybe just logging it for now, unless specific constraints are defined
                console.log("Schedule update lever not yet fully implemented, logging intent.");
                break;
        }

        // Log to Memory (Fact)
        await supabase.from('user_context').insert({
            user_id: user.id,
            type: 'fact',
            content: `User accepted lever: ${action.description}`,
            confidence: 1.0,
            source: 'weekly_review'
        });

        revalidatePath('/app');
        return { success: true };
    } catch (error) {
        console.error("Failed to apply lever:", error);
        throw new Error("Failed to apply change");
    }
}
