import { NextRequest } from 'next/server';
import { secureApiRoute, apiSuccess, apiError, validateRequiredFields } from '@/lib/security/api-protection';
import { validateCoachMessage } from '@/lib/security/input-validator';
import { generateCoachResponse, SYSTEM_PROMPTS } from '@/lib/ai/groq-client';
import { detectCrisis, CRISIS_RESPONSE } from '@/lib/celebration';
import { createClient } from '@/lib/supabase/server';
import { logAIRequest } from '@/lib/security/audit-logger';
import { MemoryService } from '@/lib/services/memory-service';

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

        // Check AI permission & Fetch Context
        const supabase = await createClient();
        const { data: profile } = await supabase
            .from('profiles')
            .select('ai_can_suggest, energy_level')
            .eq('id', context.userId)
            .single();

        if (!profile?.ai_can_suggest) {
            return apiSuccess({
                response: {
                    formatted: "I respect your preference. AI suggestions are currently disabled. You can enable them in Settings when you're ready.",
                },
            });
        }

        // ---------------------------------------------------------
        // MEMORY INTEGRATION
        // ---------------------------------------------------------

        // 1. Get or Create Conversation
        // For Coach, we used to treat everything as stateless.
        // Now we want a session. Let's get the latest active one or create one.
        // For simplicity, let's treat "Coach" as one long thread for now, OR daily.
        // Better: Just get the latest 'coach' conversation.
        let conversation = await MemoryService.getLatestConversation(context.userId, 'coach');
        if (!conversation) {
            conversation = await MemoryService.createConversation(context.userId, 'coach', 'General Coaching');
        }

        // Detect "Ignored" suggestions from previous turn
        if (conversation) {
            const history = await MemoryService.getHistory(conversation.id, 5, supabase);
            const lastAssistantMsg = [...history].reverse().find(m => m.role === 'assistant');

            if (lastAssistantMsg?.metadata?.options) {
                const options = lastAssistantMsg.metadata.options as any[];
                for (const opt of options) {
                    await MemoryService.logSignal(
                        context.userId,
                        'ignore',
                        opt.label || opt.summary,
                        { option_id: opt.id, original_msg_id: lastAssistantMsg.id },
                        supabase
                    );
                }
            }
        }

        // Add User Message to History
        if (conversation) {
            await MemoryService.addMessage(context.userId, conversation.id, 'user', sanitizedMessage);
        }

        // 3. Get History for Context
        // (We could pass this to Groq, but generateCoachResponse pulls it differently currently.
        // We should unify this. MemoryManager usage in groq-client is deprecated by this Service.)
        // But for this Sprint, let's stick to what works: Pass history if generateCoachResponse supports it.
        // Currently it uses MemoryManager.retrieveContext which is different.
        // We will update generateCoachResponse in a future step ideally, but for now we rely on the implementation plan.

        // Let's CONTINUE to use generateCoachResponse as is, BUT ensure we save the interaction to our new Memory tables.
        // This ensures we start building the dataset, even if the model doesn't read it ALL yet perfectly.
        // However, the Goal is "Real Memory". If the model ignores it, it's not real.
        // I need to ensure generateCoachResponse reads from MemoryService if possible.
        // But I can't easily change groq-client signature without breaking other things.
        // For "Hard Fix", I will persist the chat first.

        // Get user's goals for context
        const { data: goals } = await supabase
            .from('goals')
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

        // Get recent signals for memory injection
        const recentSignals = await MemoryService.getRecentSignals(context.userId, 5, supabase);

        try {
            // Generate AI response
            const result = await generateCoachResponse(
                sanitizedMessage,
                {
                    energyLevel: profile.energy_level || undefined,
                    goals: goals?.map(g => ({
                        title: g.title,
                        category: g.category,
                        importance: g.importance,
                    })),
                    recentDumps: dumps?.map(d => d.content) || [],
                    scanSignals: latestScan?.signals || [],
                    sleepWindow: userProfile ? `${userProfile.sleep_end} - ${userProfile.sleep_start}` : undefined,
                    recentSignals // Pass signals!
                },
                context.userId
            );

            // Log successful AI request
            await logAIRequest(context.userId, '/api/coach', context.request, true);

            // Save interaction (Legacy Table)
            await supabase.from('coach_interactions').insert({
                user_id: context.userId,
                user_message: sanitizedMessage,
                coach_response: result.structured || { formatted: result.formatted },
            });

            // ---------------------------------------------------------
            // SAVE TO MEMORY (New Table)
            // ---------------------------------------------------------
            if (conversation) {
                await MemoryService.addMessage(
                    context.userId,
                    conversation.id,
                    'assistant',
                    result.formatted, // Save the text response
                    result.structured || {} // Save structured options as metadata
                );
            }

            return apiSuccess({ response: result });

        } catch (error) {
            // ... existing error handler
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
