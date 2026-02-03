import { secureApiRoute, apiSuccess, apiError, validateRequiredFields } from '@/lib/security/api-protection';
import { generateAIResponse } from '@/lib/ai/groq-client';
import { validateInput } from '@/lib/security/input-validator';
import { createClient } from '@/lib/supabase/server';

interface ConversationMessage {
    role: 'user' | 'assistant';
    content: string;
}

interface HabitStackResult {
    trigger_habit: string;
    action_habit: string;
    action_duration_mins: number;
    best_time?: string;
}

export const POST = secureApiRoute(
    async (context, body) => {
        const validation = validateRequiredFields(body, ['stackName']);
        if (!validation.valid) {
            return apiError(`Missing required fields: ${validation.missing.join(', ')}`);
        }

        const {
            stackName,
            conversationHistory = [],
            userAnswers,
        } = body as {
            stackName: string;
            conversationHistory?: ConversationMessage[];
            userAnswers?: string;
        };

        // Validate input
        if (stackName.length > 200) {
            return apiError('Stack name too long');
        }

        const nameValidation = validateInput(stackName, { maxLength: 200 });
        const answersValidation = userAnswers ? validateInput(userAnswers, { maxLength: 1000, allowNewlines: true }) : null;
        const sanitizedName = nameValidation.sanitized;
        const sanitizedAnswers = answersValidation?.sanitized || '';

        // Check AI permission
        const supabase = await createClient();
        const { data: profile } = await supabase
            .from('profiles')
            .select('ai_can_suggest, preferred_name')
            .eq('id', context.userId)
            .single();

        if (!profile?.ai_can_suggest) {
            return apiError('AI suggestions are disabled in your settings', 403);
        }

        // Build the prompt based on conversation state
        let prompt: string;

        if (conversationHistory.length === 0) {
            // Initial request - AI should ask questions
            prompt = `The user wants to build a habit stack for: "${sanitizedName}"

User's name: ${profile.preferred_name || 'there'}

This is the START of the conversation. Ask 2-3 specific questions to understand their routine so you can create the perfect habit stack for them.`;
        } else {
            // Follow-up - user has answered questions
            const historyText = conversationHistory
                .map(m => `${m.role === 'user' ? 'User' : 'You'}: ${m.content}`)
                .join('\n');

            prompt = `The user wants to build a habit stack for: "${sanitizedName}"

CONVERSATION SO FAR:
${historyText}

${sanitizedAnswers ? `USER'S LATEST ANSWERS: ${sanitizedAnswers}` : ''}

Based on their answers, either:
1. Ask 1-2 more clarifying questions if needed, OR
2. Generate the final habit stack if you have enough information`;
        }

        try {
            const response = await generateAIResponse(
                prompt,
                'HABIT_STACK_GENERATOR',
                context.userId,
                true // JSON mode
            );

            // Parse the response
            const parsed = JSON.parse(response);

            if (parsed.type === 'questions') {
                return apiSuccess({
                    type: 'questions',
                    message: parsed.message,
                    questions: parsed.questions,
                });
            } else if (parsed.type === 'generated') {
                // Validate the generated stack
                const stack = parsed.habitStack as HabitStackResult;

                if (!stack.trigger_habit || !stack.action_habit) {
                    return apiError('AI generated incomplete habit stack');
                }

                return apiSuccess({
                    type: 'generated',
                    message: parsed.message,
                    habitStack: {
                        trigger_habit: stack.trigger_habit,
                        action_habit: stack.action_habit,
                        action_duration_mins: Math.min(30, Math.max(1, stack.action_duration_mins || 5)),
                        best_time: stack.best_time || 'morning',
                    },
                });
            } else {
                // Fallback - try to extract any useful data
                return apiSuccess({
                    type: 'questions',
                    message: "Let me help you create the perfect habit stack!",
                    questions: [
                        "What time of day would work best for this habit?",
                        "What's something you already do consistently that could trigger this new habit?"
                    ],
                });
            }
        } catch (error) {
            console.error('Habit stack AI error:', error);

            // Return fallback questions
            return apiSuccess({
                type: 'questions',
                message: "I'd love to help you build this habit! Let me ask a few questions.",
                questions: [
                    "When during the day would you like to do this?",
                    "What's a routine thing you already do around that time?"
                ],
            });
        }
    },
    {
        requireAuth: true,
        rateLimit: 'ai',
        auditAction: 'ai_habit_stack_generate',
    }
);
