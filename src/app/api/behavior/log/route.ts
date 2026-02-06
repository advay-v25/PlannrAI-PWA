import { NextRequest } from 'next/server';
import { secureApiRoute, apiSuccess, apiError, validateRequiredFields } from '@/lib/security/api-protection';
import { MemoryService } from '@/lib/services/memory-service';
import { createClient } from '@/lib/supabase/server';

export const POST = secureApiRoute(
    async (context, body) => {
        const validation = validateRequiredFields(body, ['type', 'content']);
        if (!validation.valid) {
            return apiError(`Missing fields: ${validation.missing.join(', ')}`);
        }

        const { type, content, metadata = {} } = body as {
            type: 'rejection' | 'acceptance' | 'ignore';
            content: string;
            metadata?: any;
        };

        const supabase = await createClient();
        await MemoryService.logSignal(context.userId, type, content, metadata, supabase);

        return apiSuccess({ logged: true });
    },
    {
        requireAuth: true,
        auditAction: 'log_behavior_signal'
    }
);
