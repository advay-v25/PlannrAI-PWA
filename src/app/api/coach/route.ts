import { NextRequest } from 'next/server';
import { secureApiRoute, apiSuccess, apiError, validateRequiredFields } from '@/lib/security/api-protection';
import { validateCoachMessage } from '@/lib/security/input-validator';
import { generateCoachResponse, SYSTEM_PROMPTS } from '@/lib/ai/groq-client';
import { detectCrisis, CRISIS_RESPONSE } from '@/lib/celebration';
import { createClient } from '@/lib/supabase/server';
import { logAIRequest } from '@/lib/security/audit-logger';
import { MemoryService } from '@/lib/services/memory-service';
import { AgentOrchestrator } from '@/lib/agents/orchestrator';

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

        const supabase = await createClient();

        // Check AI permission
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
        // 1. MEMORY & CONVERSATION SETUP
        // ---------------------------------------------------------
        let conversation = await MemoryService.getLatestConversation(context.userId, 'coach');
        if (!conversation) {
            conversation = await MemoryService.createConversation(context.userId, 'coach', 'General Coaching');
        }

        // Process previous signals (User ignored/rejected suggestions)
        if (conversation) {
            const history = await MemoryService.getHistory(conversation.id, 5, supabase);
            const lastAssistantMsg = [...history].reverse().find(m => m.role === 'assistant');

            if (lastAssistantMsg?.metadata?.options) {
                // If user is replying, they might be ignoring the previous options.
                // Simplified signal logic: If new message doesn't reference options, log 'ignore'.
                // For now, we assume implicit ignore if they type something new.
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

        if (conversation) {
            await MemoryService.addMessage(context.userId, conversation.id, 'user', sanitizedMessage);
        }

        // ---------------------------------------------------------
        // 2. ATTEMPT "DEEP BRAIN" (AGENT ORCHESTRATOR)
        // ---------------------------------------------------------
        let orchestratorResult = null;
        try {
            const orchestrator = new AgentOrchestrator();
            // This runs Planner -> Regulator -> Scheduler -> Validator
            orchestratorResult = await orchestrator.run(context.userId, sanitizedMessage);
        } catch (orchError) {
            console.warn("Orchestrator failed, falling back to Chat Brain", orchError);
        }

        // If Orchestrator found actionable options, RETURN THEM immediately.
        if (orchestratorResult && orchestratorResult.scheduler.options.length > 0) {
            const responseData = {
                formatted: orchestratorResult.summary,
                structured: {
                    options: orchestratorResult.scheduler.options.map(opt => ({
                        id: opt.id,
                        label: opt.label,
                        patch: opt.patch, // Full patch inclusion for UI to apply
                        confidence: opt.confidence_score
                    })),
                    planner: orchestratorResult.planner,
                    is_actionable: true
                }
            };

            // Log API Action
            await logAIRequest(context.userId, '/api/coach', context.request, true);

            // Save Response to DB
            await supabase.from('coach_interactions').insert({
                user_id: context.userId,
                user_message: sanitizedMessage,
                coach_response: responseData,
                intent: orchestratorResult.planner.intent
            });

            if (conversation) {
                await MemoryService.addMessage(
                    context.userId,
                    conversation.id,
                    'assistant',
                    responseData.formatted,
                    { options: responseData.structured.options, planner: responseData.structured.planner }
                );
            }

            return apiSuccess({ response: responseData });
        }

        // ---------------------------------------------------------
        // 3. FALLBACK TO "CHAT BRAIN" (Conversational)
        // ---------------------------------------------------------
        // If no options, or Planner said "unknown/clarify", use the LLM to chat.

        // Fetch Context (Legacy Manual Fetch) - In Phase 3, ContextBuilder should replace this.
        const { data: goals } = await supabase
            .from('goals')
            .select('title, category, importance')
            .eq('user_id', context.userId)
            .eq('is_paused', false);

        const { data: latestScan } = await supabase
            .from('scan_sessions')
            .select('signals, created_at')
            .eq('user_id', context.userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        const { data: userProfile } = await supabase
            .from('profiles')
            .select('sleep_start, sleep_end')
            .eq('id', context.userId)
            .single();

        const { data: dumps } = await supabase
            .from('brain_dumps')
            .select('content')
            .eq('user_id', context.userId)
            .order('created_at', { ascending: false })
            .limit(3);

        const recentSignals = await MemoryService.getRecentSignals(context.userId, 5, supabase);

        try {
            // Generate AI response
            // We inject the Orchestrator's thought process if it ran but failed to find options
            let effectiveMessage = sanitizedMessage;
            if (orchestratorResult?.planner.intent && orchestratorResult.planner.intent !== 'unknown') {
                effectiveMessage += `\n[System Note: I tried to plan this as '${orchestratorResult.planner.intent}' but found no valid calendar options. Please guide the user.]`;
            }

            const result = await generateCoachResponse(
                effectiveMessage,
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

            // Save to Memory
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
