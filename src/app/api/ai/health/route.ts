import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';

export const maxDuration = 60;

export const GET = secureApiRoute(
    async (context) => {
        const results: any[] = [];
        
        const checkProvider = async (name: string, url: string, headers: any) => {
            if (!headers['Authorization'] || headers['Authorization'] === 'Bearer undefined' || headers['Authorization'] === 'Bearer ') {
                results.push({ provider: name, status: 'missing' });
                return;
            }
            const start = Date.now();
            try {
                const response = await fetch(url, { headers });
                const latency = Date.now() - start;
                if (response.ok) {
                    results.push({ provider: name, status: 'healthy', latency_ms: latency, code: response.status });
                } else {
                    results.push({ provider: name, status: 'invalid', latency_ms: latency, code: response.status });
                }
            } catch (e: any) {
                results.push({ provider: name, status: 'error', latency_ms: Date.now() - start, code: 500 });
            }
        };

        await Promise.all([
            checkProvider('groq', 'https://api.groq.com/openai/v1/models', {
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
            }),
            checkProvider('openrouter', 'https://openrouter.ai/api/v1/auth/key', {
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`
            }),
            checkProvider('nvidia', 'https://integrate.api.nvidia.com/v1/models', {
                'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}`
            }),
            checkProvider('nvidia-calendar', 'https://integrate.api.nvidia.com/v1/models', {
                'Authorization': `Bearer ${process.env.CALENDAR_NVIDIA_API_KEY}`
            }),
            checkProvider('nvidia-tertiary', 'https://integrate.api.nvidia.com/v1/models', {
                'Authorization': `Bearer ${process.env.NVIDIA_API_KEY_TERTIARY}`
            }),
            checkProvider('gemini', 'https://generativelanguage.googleapis.com/v1beta/models', {
                'Authorization': `Bearer ${process.env.GEMINI_API_KEY}`
            })
        ]);

        return apiSuccess({ providers: results });
    },
    { requireAuth: true }
);
