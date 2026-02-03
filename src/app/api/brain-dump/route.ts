import { NextRequest } from 'next/server';
import { secureApiRoute, apiSuccess, apiError, validateRequiredFields } from '@/lib/security/api-protection';
import { validateBrainDump } from '@/lib/security/input-validator';
import { createClient } from '@/lib/supabase/server';

// GET - List brain dumps
export const GET = secureApiRoute(
    async (context) => {
        const supabase = await createClient();

        const { data: dumps, error } = await supabase
            .from('brain_dumps')
            .select('id, content, created_at')
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

        const supabase = await createClient();

        const { data: dump, error } = await supabase
            .from('brain_dumps')
            .insert({
                user_id: context.userId,
                content: contentValidation.sanitized,
            })
            .select()
            .single();

        if (error) {
            return apiError('Failed to create brain dump', 500);
        }

        // Trigger background AI processing (don't await)
        fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/brain-dump/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dumpId: dump.id }),
        }).catch(() => {
            // Silently fail - processing is optional
        });

        return apiSuccess({ dump }, 201);
    },
    { requireAuth: true, rateLimit: 'brainDump', auditAction: 'brain_dump_create' }
);
