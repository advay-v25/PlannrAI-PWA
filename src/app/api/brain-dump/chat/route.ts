import { NextRequest } from 'next/server';
import { secureApiRoute, apiSuccess, apiError, validateRequiredFields } from '@/lib/security/api-protection';
import { validateCoachMessage } from '@/lib/security/input-validator';
import { generateAIResponse, SYSTEM_PROMPTS } from '@/lib/ai/groq-client';
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

        const { message, conversationHistory = [] } = body as {
            message: string;
            conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
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
                response: CRISIS_RESPONSE,
                isCrisis: true,
            });
        }

        // Check AI permission
        const supabase = await createClient();
        const { data: profile } = await supabase
            .from('profiles')
            .select('ai_can_analyze, preferred_name, energy_level')
            .eq('id', context.userId)
            .single();

        if (!profile?.ai_can_analyze) {
            return apiSuccess({
                response: "I'm here when you're ready. You can enable AI analysis in Settings whenever you like.",
                aiDisabled: true,
            });
        }

        // Get user's goals for context
        const { data: goals } = await supabase
            .from('goals')
            .select('title, category, importance, notes')
            .eq('user_id', context.userId)
            .eq('is_paused', false);

        // Get recent brain dump entries for context
        const { data: recentDumps } = await supabase
            .from('brain_dumps')
            .select('content, created_at')
            .eq('user_id', context.userId)
            .order('created_at', { ascending: false })
            .limit(3);

        // Build context-rich prompt
        const contextPrompt = `
USER INFO:
- Name: ${profile.preferred_name || 'there'}
- Current Energy Level: ${profile.energy_level || 'unknown'}/5

THEIR GOALS:
${goals?.map(g => `- ${g.title} (${g.category}, ${g.importance} priority)${g.notes ? ` - ${g.notes}` : ''}`).join('\n') || 'No active goals set.'}

RECENT THOUGHTS (for context):
${recentDumps?.map(d => `- "${d.content.substring(0, 100)}..."`).join('\n') || 'Fresh conversation.'}

CONVERSATION HISTORY:
${conversationHistory.slice(-4).map(m => `${m.role === 'user' ? 'User' : 'Donna'}: ${m.content}`).join('\n')}

CURRENT MESSAGE:
User: ${sanitizedMessage}

Respond as Donna would. Be sharp, warm, and genuinely helpful.`;

        try {
            // Generate AI response using Donna persona
            const response = await generateAIResponse(
                contextPrompt,
                'DONNA_BRAIN_DUMP',
                context.userId,
                false, // Not JSON mode - natural conversation
                profile.energy_level
            );

            // Parse any extracted actions
            let cleanResponse = response;
            let extractedActions: Array<{ task: string; priority: string }> = [];

            const actionsMatch = response.match(/\[ACTIONS_EXTRACTED\]([\s\S]*?)\[END_ACTIONS\]/);
            if (actionsMatch) {
                cleanResponse = response.replace(/\[ACTIONS_EXTRACTED\][\s\S]*?\[END_ACTIONS\]/, '').trim();

                // Parse YAML-like actions
                const actionLines = actionsMatch[1].split('\n').filter(l => l.includes('task:'));
                extractedActions = actionLines.map(line => {
                    const taskMatch = line.match(/task:\s*["']?([^"'\n]+)["']?/);
                    const priorityMatch = line.match(/priority:\s*["']?(\w+)["']?/);
                    return {
                        task: taskMatch?.[1] || '',
                        priority: priorityMatch?.[1] || 'medium'
                    };
                }).filter(a => a.task);
            }

            // Log successful AI request
            await logAIRequest(context.userId, '/api/brain-dump/chat', context.request, true);

            // Save the brain dump content
            await supabase.from('brain_dumps').insert({
                user_id: context.userId,
                content: sanitizedMessage,
                ai_sentiment: extractedActions.length > 0 ? 'actionable' : 'reflective',
            });

            return apiSuccess({
                response: cleanResponse,
                extractedActions,
                donnaName: profile.preferred_name ? `Hi ${profile.preferred_name}` : undefined,
            });

        } catch (error) {
            // Log failed AI request
            await logAIRequest(context.userId, '/api/brain-dump/chat', context.request, false, {
                error: error instanceof Error ? error.message : 'Unknown error',
            });

            const errorMessage = error instanceof Error ? error.message : '';

            if (errorMessage.includes('GROQ_API_KEY')) {
                return apiSuccess({
                    response: "I need my connection configured. Ask Advay to add the Groq API key.",
                });
            }

            if (errorMessage.includes('Rate limited')) {
                return apiSuccess({
                    response: "Give me a second to catch my breath. Try that again in a moment.",
                });
            }

            return apiSuccess({
                response: "Something's off on my end. Try again in a moment?",
            });
        }
    },
    {
        requireAuth: true,
        rateLimit: 'ai',
        auditAction: 'brain_dump_chat',
    }
);
