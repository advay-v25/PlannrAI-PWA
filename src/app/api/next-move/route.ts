/**
 * PlannrAI - Next Move Guidance API
 * Provides energy-based activity suggestions when user is uncertain
 */

import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import Groq from 'groq-sdk';

// Activity suggestions based on energy level
const ENERGY_BASED_SUGGESTIONS = {
    high: {
        activities: [
            { type: 'deep_work', label: 'Deep Focus Work', description: 'Tackle your hardest task', duration: 90, icon: 'brain' },
            { type: 'creative', label: 'Creative Project', description: 'Work on something inspiring', duration: 60, icon: 'sparkles' },
            { type: 'learning', label: 'Active Learning', description: 'Study something new', duration: 45, icon: 'book' },
        ],
        message: 'Your energy is high! Perfect time for challenging work.',
    },
    medium: {
        activities: [
            { type: 'routine', label: 'Routine Tasks', description: 'Clear your to-do list', duration: 45, icon: 'check' },
            { type: 'review', label: 'Review & Organize', description: 'Plan and prioritize', duration: 30, icon: 'calendar' },
            { type: 'communication', label: 'Correspondence', description: 'Emails & messages', duration: 30, icon: 'mail' },
        ],
        message: 'Moderate energy - good for steady progress.',
    },
    low: {
        activities: [
            { type: 'rest', label: 'Take a Break', description: 'Rest and recharge', duration: 15, icon: 'coffee' },
            { type: 'light', label: 'Light Tasks', description: 'Easy, low-effort work', duration: 20, icon: 'feather' },
            { type: 'walk', label: 'Movement Break', description: 'Short walk or stretch', duration: 10, icon: 'activity' },
        ],
        message: 'Energy is low. Honor your body and rest.',
    },
};

interface NextMoveOption {
    id: string;
    type: string;
    label: string;
    description: string;
    duration: number;
    icon: string;
    reasoning?: string;
    priority: 'high' | 'medium' | 'low';
    tradeoff?: string;
}

interface NextMoveGuidance {
    message: string;
    options: NextMoveOption[];
    context: {
        energyLevel: number;
        timeOfDay: string;
        pendingBlocks: number;
        suggestedAction: 'continue' | 'shift' | 'rest';
    };
}

// AI prompt for personalized guidance
const NEXT_MOVE_PROMPT = `You are a supportive productivity coach helping someone decide what to do next. Based on their context, provide 3 personalized suggestions.

Consider:
- Their current energy level (1-5)
- Time of day
- Pending tasks
- Recent patterns

Respond in JSON:
{
  "message": "Brief, encouraging message (1-2 sentences)",
  "suggestedAction": "continue | shift | rest",
  "options": [
    {
      "type": "activity type",
      "label": "Short label",
      "description": "Brief description",
      "duration": minutes,
      "reasoning": "Why this is good now",
      "priority": "high | medium | low",
      "tradeoff": "What they might sacrifice"
    }
  ]
}`;

function getEnergyCategory(level: number): 'high' | 'medium' | 'low' {
    if (level >= 4) return 'high';
    if (level >= 3) return 'medium';
    return 'low';
}

function getTimeOfDay(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
}

// Helper to generate unique IDs
function generateId(): string {
    return Math.random().toString(36).substring(2, 11);
}

// GET - Get next move guidance
export const GET = secureApiRoute(
    async (context) => {
        const { searchParams } = new URL(context.request.url);
        const energyParam = searchParams.get('energy_level');
        const useAi = searchParams.get('use_ai') !== 'false';

        const supabase = await createClient();
        const today = new Date().toISOString().split('T')[0];

        // Get today's energy if not provided
        let energyLevel = energyParam ? parseInt(energyParam, 10) : 3;

        if (!energyParam) {
            const { data: log } = await supabase
                .from('daily_logs')
                .select('energy_level')
                .eq('user_id', context.userId)
                .eq('log_date', today)
                .single();

            if (log?.energy_level) {
                energyLevel = log.energy_level;
            }
        }

        // Get pending blocks for context
        const { data: pendingBlocks } = await supabase
            .from('schedule_blocks')
            .select('id, goal:goals(title, category), start_time, end_time')
            .eq('user_id', context.userId)
            .eq('date', today)
            .eq('status', 'planned');

        const pendingCount = pendingBlocks?.length || 0;
        const energyCategory = getEnergyCategory(energyLevel);
        const timeOfDay = getTimeOfDay();

        let guidance: NextMoveGuidance;

        // Try AI for personalized guidance
        if (useAi && process.env.GROQ_API_KEY && pendingBlocks && pendingBlocks.length > 0) {
            try {
                const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

                const aiContext = `
Energy Level: ${energyLevel}/5 (${energyCategory})
Time of Day: ${timeOfDay}
Pending Blocks: ${pendingCount}
${pendingBlocks.slice(0, 3).map(b => {
                    // goal comes as array from Supabase join, get first element
                    const goalData = Array.isArray(b.goal) ? b.goal[0] : b.goal;
                    return `- ${goalData?.title || 'Task'} (${b.start_time} - ${b.end_time})`;
                }).join('\n')}
`;

                const completion = await groq.chat.completions.create({
                    model: 'llama-3.3-70b-versatile',
                    messages: [
                        { role: 'system', content: NEXT_MOVE_PROMPT },
                        { role: 'user', content: aiContext },
                    ],
                    temperature: 0.5,
                    max_tokens: 600,
                });

                const responseText = completion.choices[0]?.message?.content || '';
                const jsonMatch = responseText.match(/\{[\s\S]*\}/);

                if (jsonMatch) {
                    const aiResult = JSON.parse(jsonMatch[0]);

                    guidance = {
                        message: aiResult.message || ENERGY_BASED_SUGGESTIONS[energyCategory].message,
                        options: (aiResult.options || []).map((opt: Partial<NextMoveOption>) => ({
                            id: generateId(),
                            type: opt.type || 'task',
                            label: opt.label || 'Activity',
                            description: opt.description || '',
                            duration: opt.duration || 30,
                            icon: opt.icon || 'circle',
                            reasoning: opt.reasoning,
                            priority: opt.priority || 'medium',
                            tradeoff: opt.tradeoff,
                        })),
                        context: {
                            energyLevel,
                            timeOfDay,
                            pendingBlocks: pendingCount,
                            suggestedAction: aiResult.suggestedAction || (energyCategory === 'low' ? 'rest' : 'continue'),
                        },
                    };
                } else {
                    throw new Error('No JSON in AI response');
                }
            } catch (aiError) {
                console.error('AI guidance failed:', aiError);
                // Fall back to rule-based
                const template = ENERGY_BASED_SUGGESTIONS[energyCategory];
                guidance = {
                    message: template.message,
                    options: template.activities.map(act => ({
                        id: generateId(),
                        ...act,
                        priority: energyCategory === 'low' ? 'low' : 'medium',
                    })),
                    context: {
                        energyLevel,
                        timeOfDay,
                        pendingBlocks: pendingCount,
                        suggestedAction: energyCategory === 'low' ? 'rest' : 'continue',
                    },
                };
            }
        } else {
            // Rule-based suggestions
            const template = ENERGY_BASED_SUGGESTIONS[energyCategory];
            guidance = {
                message: template.message,
                options: template.activities.map(act => ({
                    id: generateId(),
                    ...act,
                    priority: energyCategory === 'low' ? 'low' : 'medium',
                })),
                context: {
                    energyLevel,
                    timeOfDay,
                    pendingBlocks: pendingCount,
                    suggestedAction: energyCategory === 'low' ? 'rest' : 'continue',
                },
            };
        }

        return apiSuccess({ guidance });
    },
    { requireAuth: true }
);

// POST - Record action taken
export const POST = secureApiRoute(
    async (context, body) => {
        const { action, option_id, option_type, notes } = body as {
            action: 'selected' | 'dismissed' | 'snoozed';
            option_id?: string;
            option_type?: string;
            notes?: string;
        };

        if (!action) {
            return apiError('action is required');
        }

        const supabase = await createClient();
        const today = new Date().toISOString().split('T')[0];

        // Log the action for analytics
        const { error } = await supabase
            .from('daily_logs')
            .upsert({
                user_id: context.userId,
                log_date: today,
                signals: [
                    {
                        type: 'next_move_action',
                        content: action,
                        option_id,
                        option_type,
                        notes,
                        timestamp: new Date().toISOString(),
                    },
                ],
            }, {
                onConflict: 'user_id,log_date',
            });

        if (error) {
            console.error('Failed to log next move action:', error);
            // Don't fail the request, just log it
        }

        return apiSuccess({
            recorded: true,
            action,
            message: action === 'selected'
                ? 'Great choice! Get started when ready.'
                : action === 'snoozed'
                    ? 'No problem, I\'ll check back in a bit.'
                    : 'Understood. Let me know when you need guidance.',
        });
    },
    { requireAuth: true, auditAction: 'next_move_action' }
);
