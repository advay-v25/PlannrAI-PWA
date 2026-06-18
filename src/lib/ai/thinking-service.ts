import { createClient } from '@/lib/supabase/server';
import { executeAI } from '@/lib/ai/ai-service';
import { ContextService } from '@/lib/ai/context-service';

export class ThinkingService {
    /**
     * Triggered in the background after significant user actions.
     */
    static async evaluateContextAndPropose(userId: string, eventDetails: string, sourceId?: string, sourceType: string = 'system') {
        try {
            console.log(`[Thinking Layer] Evaluating context for user ${userId} triggered by ${eventDetails}`);

            // 1. Get deep context
            const supabase = await createClient();
            const { buildFeatureContext } = await import('@/lib/services/feature-context');

            const featureCtx = await buildFeatureContext(userId, supabase, {
                includeChatHistory: false,

                includeHabitStacks: true,
                weekDays: 3
            });

            // 2. Pass to proactive thinking channel
            const aiResponse: any = await executeAI(userId, {
                channel: 'proactive_thinker',
                input: eventDetails,
                context: featureCtx
            });

            // 3. If a proposal was generated, save it to the database
            if (aiResponse?.has_proposal && aiResponse.proposal) {
                const p = aiResponse.proposal;

                // Check if an identical active proposal already exists to prevent spam
                const { data: existing } = await supabase
                    .from('ai_proposals')
                    .select('id')
                    .eq('user_id', userId)
                    .eq('status', 'pending')
                    .eq('proposal_type', p.proposal_type)
                    .limit(1);

                if (existing && existing.length > 0) {
                    console.log(`[Thinking Layer] Pending proposal of type ${p.proposal_type} already exists. Skipping.`);
                    return null;
                }

                // Insert the new proposal
                const { data: inserted, error } = await supabase
                    .from('ai_proposals')
                    .insert({
                        user_id: userId,
                        title: p.title,
                        description: p.description,
                        proposal_type: p.proposal_type,
                        priority: p.priority || 3,
                        action_data: p.action_data || {},
                        status: 'pending',
                        source_id: sourceId,
                        source_type: sourceType,
                        created_at: new Date().toISOString()
                    })
                    .select()
                    .single();

                if (error) {
                    console.error('[Thinking Layer] Error inserting proposal:', error);
                } else {
                    console.log(`[Thinking Layer] Generated new proposal: ${p.title}`);
                    return inserted;
                }
            } else {
                console.log(`[Thinking Layer] No proposal deemed necessary by AI.`);
            }

            return null;
        } catch (error) {
            console.error('[Thinking Layer] Final error:', error);
            return null;
        }
    }
}
