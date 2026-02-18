
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';

export const GET = secureApiRoute(
    async (context) => {
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
            return apiSuccess({ status: 'missing', provider: 'groq' });
        }

        try {
            // Simple model list call to verify key
            const response = await fetch('https://api.groq.com/openai/v1/models', {
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                }
            });

            if (response.ok) {
                return apiSuccess({ status: 'healthy', provider: 'groq' });
            } else {
                return apiSuccess({ status: 'invalid', provider: 'groq', code: response.status });
            }
        } catch (e) {
            return apiError('Health check failed', 500);
        }
    },
    { requireAuth: true } // Only logged in users can check system health
);
