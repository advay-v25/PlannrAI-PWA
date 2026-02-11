import { NextRequest } from 'next/server';
import { secureApiRoute, apiSuccess, apiError, validateRequiredFields } from '@/lib/security/api-protection';
import { validateUUID } from '@/lib/security/input-validator';
import { processBrainDumpWithSignals } from '@/lib/ai/brain-dump-processor';
import { createClient } from '@/lib/supabase/server';
import { logAIRequest } from '@/lib/security/audit-logger';

export const POST = secureApiRoute(
    async (context, body) => {
        // Validate required fields
        const validation = validateRequiredFields(body, ['dumpId']);
        if (!validation.valid) {
            return apiError(`Missing required fields: ${validation.missing.join(', ')}`);
        }

        const { dumpId } = body as { dumpId: string };

        // Validate UUID format
        const uuidValidation = validateUUID(dumpId);
        if (!uuidValidation.valid) {
            return apiError('Invalid dump ID format');
        }

        const supabase = await createClient();

        // Check AI permission
        const { data: profile } = await supabase
            .from('profiles')
            .select('ai_can_analyze')
            .eq('id', context.userId)
            .single();

        if (!profile?.ai_can_analyze) {
            // AI analysis disabled, skip silently
            return apiSuccess({ success: true, skipped: true });
        }

        // Get the brain dump
        const { data: dump, error } = await supabase
            .from('brain_dump_entries')
            .select('raw_text')
            .eq('id', dumpId)
            .eq('user_id', context.userId)
            .single();

        if (error || !dump) {
            return apiError('Brain dump not found', 404);
        }

        try {
            // Process with AI via new Engine
            const analysis = await processBrainDumpWithSignals(
                dump.raw_text,
                context.userId,
                // In a real app we'd fetch user's timezone from profile, defaulting to UTC for now
                'UTC'
            );

            // Log AI request
            await logAIRequest(context.userId, '/api/brain-dump/process', context.request, true);

            // Update the brain dump with extracted data
            await supabase
                .from('brain_dump_entries')
                .update({
                    extracted_json: analysis,
                })
                .eq('id', dumpId);

            // ---------------------------------------------------------
            // MEMORY INTEGRATION (Phase 4)
            // ---------------------------------------------------------
            try {
                const { MemoryService } = await import('@/lib/services/memory-service');

                // Extract long-term facts/constraints
                await MemoryService.extractFacts(context.userId, dump.raw_text, dumpId);

            } catch (memError) {
                console.error("Memory Extraction Failed", memError);
                // Don't fail the request
            }

            // ---------------------------------------------------------
            // ACTION ENRICHMENT (Talk = Action)
            // ---------------------------------------------------------
            // If the analysis suggests actions but patches are missing/empty, generate them.
            if (analysis.recommended_actions && analysis.recommended_actions.length > 0) {
                const { ContextBuilder } = await import('@/lib/agents/context-builder');
                const { generateAIPatch } = await import('@/lib/ai/groq-client');

                // Build context for the Patcher (needs schedule)
                const agentContext = await ContextBuilder.build(context.userId, supabase);

                for (const action of analysis.recommended_actions) {
                    // specific check: if patch is empty or dummy
                    if (!action.patch || action.patch.changes.length === 0) {
                        try {
                            const generatedPatch = await generateAIPatch(
                                action.label,
                                { reason: action.reasoning }, // Intent
                                { currentSchedule: agentContext.currentSchedule },
                                context.userId
                            );

                            if (generatedPatch && !generatedPatch.error) {
                                action.patch = generatedPatch;
                            }
                        } catch (e) {
                            console.error("Failed to enrich action with patch", e);
                        }
                    }
                }
            }

            return apiSuccess({ success: true, analysis });

        } catch (error) {
            // Log failed AI request
            await logAIRequest(context.userId, '/api/brain-dump/process', context.request, false, {
                error: error instanceof Error ? error.message : 'Unknown error',
            });

            // Fail silently - this is invisible to user
            return apiSuccess({ success: false });
        }
    },
    {
        requireAuth: true,
        rateLimit: 'brainDump',
        auditAction: 'brain_dump_process',
    }
);
