import { secureApiRoute, apiSuccess, apiError, validateRequiredFields } from '@/lib/security/api-protection';
import { runAI } from '@/lib/ai/run-ai';
import { validateInput } from '@/lib/security/input-validator';
import { createClient } from '@/lib/supabase/server';

interface ConversationMessage {
    role: 'user' | 'assistant';
    content: string;
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

        // Build context for Neural OS
        const aiContext = {
            goal: sanitizedName,
            user_name: profile.preferred_name,
            history: conversationHistory,
            last_answer: sanitizedAnswers,
        };

        const input = conversationHistory.length === 0
            ? `I want to build a habit stack for: "${sanitizedName}". Help me design it.`
            : `User answered: ${sanitizedAnswers}. Based on this and history, design the stack or ask clarification.`;

        try {
            // Use Neural OS Agent
            const response = await runAI({
                channel: 'habit_stack',
                input: input,
                context: aiContext,
                userId: context.userId,
                limits: { max_options: 1 } // We only want one best stack proposal
            });

            // Map Neural OS response to Habit Stack format
            if (response.mode === 'ask' && response.question) {
                return apiSuccess({
                    type: 'questions',
                    message: response.summary,
                    questions: response.question.choices || [response.question.prompt],
                });
            } else if ((response.mode === 'propose' || response.mode === 'execute') && response.options?.[0]) {
                const option = response.options[0];
                const patch = option.patch.ops.find(op => op.op === 'create_habit_stack');

                if (patch && patch.op === 'create_habit_stack') {
                    return apiSuccess({
                        type: 'generated',
                        message: response.summary,
                        habitStack: {
                            trigger_habit: patch.trigger,
                            action_habit: patch.action,
                            action_duration_mins: patch.duration,
                            best_time: patch.time_of_day,
                        },
                    });
                }
            }

            // Fallback or Refusal
            return apiSuccess({
                type: 'questions',
                message: response.refusal?.reason || "I need a bit more detail to design this perfectly.",
                questions: [
                    "When do you want to do this?",
                    "What is a reliable anchor habit you already do?"
                ],
            });

        } catch (error) {
            console.error('Habit stack AI error:', error);
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
