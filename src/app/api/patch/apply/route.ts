// @ts-nocheck
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { PatchService } from '@/lib/services/patch-service';
import { PatchSchema } from '@/lib/ai/schemas';
import { z } from 'zod';

const ApplyBodySchema = z.object({
    patch: PatchSchema,
    source: z.string().default('ai_assist'),
});

export const POST = secureApiRoute(
    async (context, body) => {
        const validation = ApplyBodySchema.safeParse(body);
        if (!validation.success) {
            return apiError('Invalid patch format', 400, validation.error.format());
        }

        const { patch, source } = validation.data;

        try {
            const result = await PatchService.applyPatch(context.userId, patch, source);
            return apiSuccess(result);
        } catch (error: any) {
            console.error('[Patch Apply Error]', error);
            return apiError('Failed to apply patch', 500, { message: error.message });
        }
    },
    {
        requireAuth: true,
        auditAction: 'patch_apply',
    }
);
