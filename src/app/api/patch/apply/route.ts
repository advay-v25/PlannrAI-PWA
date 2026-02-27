import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { PatchService } from '@/lib/services/patch-service';
import { z } from 'zod';

const ApplyBodySchema = z.object({
    patch: z.any(), // Accepts PatchSchema format; PatchService validates internally
    source: z.string().default('ai_assist'),
    context: z.string().optional(),
});

export const POST = secureApiRoute(
    async (context, body) => {
        const validation = ApplyBodySchema.safeParse(body);
        if (!validation.success) {
            return apiError('Invalid patch format', 400, 'VALIDATION_ERROR', validation.error.format());
        }

        const { patch, source } = validation.data;

        try {
            const result = await PatchService.applyPatch(
                context.userId,
                patch,
                context.supabase,
                source
            );
            return apiSuccess(result);
        } catch (error: any) {
            console.error('[Patch Apply Error]', error);
            return apiError('Failed to apply patch', 500, 'INTERNAL_ERROR', { message: error.message });
        }
    },
    {
        requireAuth: true,
        auditAction: 'patch_apply',
    }
);

