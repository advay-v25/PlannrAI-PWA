import { NextRequest } from 'next/server';
import { secureApiRoute, apiSuccess, apiError, validateRequiredFields } from '@/lib/security/api-protection';
import { validateUUID } from '@/lib/security/input-validator';
import { processBrainDump } from '@/lib/ai/groq-client';
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
            .from('brain_dumps')
            .select('content')
            .eq('id', dumpId)
            .eq('user_id', context.userId)
            .single();

        if (error || !dump) {
            return apiError('Brain dump not found', 404);
        }

        try {
            // Process with AI (invisible to user)
            const extracted = await processBrainDump(dump.content, context.userId);

            // Log AI request
            await logAIRequest(context.userId, '/api/brain-dump/process', context.request, true);

            // Update the brain dump with extracted data
            await supabase
                .from('brain_dumps')
                .update({
                    extracted_signals: extracted.signals,
                    detected_constraints: extracted.constraints,
                    processed_data: extracted.processed_data, // Save full AI analysis
                })
                .eq('id', dumpId);

            return apiSuccess({ success: true });

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
