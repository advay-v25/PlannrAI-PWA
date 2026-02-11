import { NextRequest } from 'next/server';
import { secureApiRoute, apiSuccess, apiError, validateRequiredFields } from '@/lib/security/api-protection';
import { validateBrainDump } from '@/lib/security/input-validator';
import { createClient } from '@/lib/supabase/server';

// GET - List brain dumps
export const GET = secureApiRoute(
    async (context) => {
        const supabase = await createClient();

        const { data: dumps, error } = await supabase
            .from('brain_dump_entries')
            .select('id, raw_text, created_at')
            .eq('user_id', context.userId)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) {
            return apiError('Failed to fetch brain dumps', 500);
        }

        return apiSuccess({ dumps });
    },
    { requireAuth: true }
);

// POST - Create a brain dump
export const POST = secureApiRoute(
    async (context, body) => {
        const validation = validateRequiredFields(body, ['content']);
        if (!validation.valid) {
            return apiError(`Missing required fields: ${validation.missing.join(', ')}`);
        }

        const { content } = body as { content: string };

        // Validate content
        const contentValidation = validateBrainDump(content);
        if (!contentValidation.valid) {
            return apiError(contentValidation.errors.join(', '));
        }

        // Create brain dump entry via MemoryService
        const { MemoryService } = await import('@/lib/services/memory-service');
        const dump = await MemoryService.createBrainDumpEntry(context.userId, contentValidation.sanitized);

        if (!dump) {
            return apiError('Failed to create brain dump', 500);
        }

        // Process with AI (Await for reliability)
        try {
            const { BrainDumpService } = await import('@/lib/brain-dump/brain-dump-service');
            const { buildBrainDumpContext, saveBrainDumpExtraction, updateUserStateFromSignals } = await import('@/lib/brain-dump/brain-dump-context');
            const { createClient } = await import('@/lib/supabase/server');

            const supabase = await createClient();
            const dumpContext = await buildBrainDumpContext(context.userId, supabase);

            const { analysis } = await BrainDumpService.process(contentValidation.sanitized, dumpContext);

            // Persist analysis
            await saveBrainDumpExtraction(context.userId, dump.id, analysis.extracted, supabase);
            await updateUserStateFromSignals(context.userId, analysis.extracted.signals, supabase);

        } catch (error) {
            console.error('Brain Dump Processing Failed (Background):', error);
            // We do NOT fail the request if AI fails, as the dump is saved.
            // But we might want to flag it?
        }

        return apiSuccess({ dump }, 201);
    },
    { requireAuth: true, rateLimit: 'brainDump', auditAction: 'brain_dump_create' }
);
