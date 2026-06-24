import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';

export const runtime = 'nodejs';

export const GET = secureApiRoute(async (context) => {
    const hasKey = !!process.env.GROQ_API_KEY;

    // Optional auth check for external monitors
    const authHeader = context.request.headers.get('authorization');
    const isValidCron = authHeader === `Bearer ${process.env.CRON_SECRET}` || process.env.NODE_ENV === 'development';
    
    if (!isValidCron) {
        return apiError('Unauthorized', 401);
    }

    try {
        if (!hasKey) throw new Error('GROQ_API_KEY missing');

        // Simply check configuration, do not burn real AI tokens
        return apiSuccess({
            status: 'ok',
            key_configured: true,
            model_response: 'simulated_pong'
        });
    } catch (error: any) {
        return apiError(error.message, 500, 'AI_CONFIG_ERROR', { key_configured: hasKey });
    }
}, { requireAuth: false, skipRateLimit: true });
