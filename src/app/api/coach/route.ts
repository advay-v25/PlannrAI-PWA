import { NextRequest } from 'next/server';
import { secureApiRoute, apiSuccess, apiError, validateRequiredFields } from '@/lib/security/api-protection';
import { validateCoachMessage } from '@/lib/security/input-validator';
import { generateCoachResponse, SYSTEM_PROMPTS } from '@/lib/ai/groq-client';
import { detectCrisis, CRISIS_RESPONSE } from '@/lib/celebration';
import { createClient } from '@/lib/supabase/server';
import { logAIRequest } from '@/lib/security/audit-logger';

export const POST = secureApiRoute(
    async (context, body) => {
        // Validate required fields
        const validation = validateRequiredFields(body, ['message']);
        if (!validation.valid) {
            return apiError(`Missing required fields: ${validation.missing.join(', ')}`);
        }

        const { message, lowEnergyMode = false } = body as {
            message: string;
            lowEnergyMode?: boolean;
        };

        // Validate and sanitize message
        const messageValidation = validateCoachMessage(message);
        if (!messageValidation.valid) {
            return apiError(messageValidation.errors.join(', '));
        }

        const sanitizedMessage = messageValidation.sanitized;

        // Check for crisis language
        if (detectCrisis(sanitizedMessage)) {
            return apiSuccess({
                response: {
                    formatted: CRISIS_RESPONSE,
                    isCrisisResponse: true,
                },
            });
        }

        // Check AI permission
        const supabase = await createClient();
        const { data: profile } = await supabase
            .from('profiles')
            .select('ai_can_suggest')
            .eq('id', context.userId)
            .single();

        if (!profile?.ai_can_suggest) {
            return apiSuccess({
                response: {
                    formatted: "I respect your preference. AI suggestions are currently disabled. You can enable them in Settings when you're ready.",
                },
            });
        }

        // Get user's goals for context
        const { data: goals } = await supabase
            .from('goals')
            .select('title, category, importance')
            .select('title, category, importance')
            .eq('user_id', context.userId)
            .eq('is_paused', false);

        // Get latest scan signals (Bio-Context)
        const { data: latestScan } = await supabase
            .from('scan_sessions')
            .select('signals, created_at')
            .eq('user_id', context.userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        // Get profile context (Sleep)
        const { data: userProfile } = await supabase
            .from('profiles')
            .select('sleep_start, sleep_end')
            .eq('id', context.userId)
            .single();

        // Get recent brain dumps for immediate context
        const { data: dumps } = await supabase
            .from('brain_dumps')
            .select('content')
            .eq('user_id', context.userId)
            .order('created_at', { ascending: false })
            .limit(3);

        try {
            // Generate AI response
            const result = await generateCoachResponse(
                sanitizedMessage,
                {
                    lowEnergyMode,
                    goals: goals?.map(g => ({
                        title: g.title,
                        category: g.category,
                        importance: g.importance,
                    })),
                    recentDumps: dumps?.map(d => d.content) || [],
                    scanSignals: latestScan?.signals || [],
                    sleepWindow: userProfile ? `${userProfile.sleep_end} - ${userProfile.sleep_start}` : undefined
                },
                context.userId
            );

            // Log successful AI request
            await logAIRequest(context.userId, '/api/coach', context.request, true);

            // Save interaction
            await supabase.from('coach_interactions').insert({
                user_id: context.userId,
                user_message: sanitizedMessage,
                coach_response: result.structured || { formatted: result.formatted },
            });

            return apiSuccess({ response: result });

        } catch (error) {
            // Log failed AI request
            await logAIRequest(context.userId, '/api/coach', context.request, false, {
                error: error instanceof Error ? error.message : 'Unknown error',
            });

            // Check for specific error types
            const errorMessage = error instanceof Error ? error.message : '';

            if (errorMessage.includes('GROQ_API_KEY')) {
                return apiSuccess({
                    response: {
                        formatted: "The AI coach needs to be configured. Please add your Groq API key to the environment variables. Get a free key at https://console.groq.com",
                    },
                });
            }

            if (errorMessage.includes('Rate limited')) {
                return apiSuccess({
                    response: {
                        formatted: "I need a moment to catch my breath. Please try again in a few seconds.",
                    },
                });
            }

            return apiSuccess({
                response: {
                    formatted: "I'm having trouble processing right now. Please try again in a moment.",
                },
            });
        }
    },
    {
        requireAuth: true,
        rateLimit: 'ai',
        auditAction: 'coach_chat',
    }
);
