/**
 * PlannrAI - Deviation Classification API
 * Classifies and logs deviations from planned activities
 * Categories: unavoidable, structural, energy, skill, avoidance
 */

import { secureApiRoute, apiSuccess, apiError, validateRequiredFields } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import Groq from 'groq-sdk';

const DEVIATION_TYPES = [
    'unavoidable',   // External factors beyond control (emergency, illness)
    'structural',    // Schedule/environment issues (bad timing, wrong place)
    'energy',        // Low energy, fatigue, burnout
    'skill',         // Task too hard, unclear, overwhelming
    'avoidance',     // Procrastination, fear, perfectionism
] as const;

type DeviationType = typeof DEVIATION_TYPES[number];

interface DeviationClassification {
    type: DeviationType;
    confidence: number;
    explanation: string;
    suggestions: string[];
    rootCause?: string;
    patternMatch?: string;
}

// System prompt for AI classification
const DEVIATION_CLASSIFIER_PROMPT = `You are an expert at analyzing why people deviate from their planned activities. Your job is to classify deviations accurately and compassionately.

DEVIATION CATEGORIES:
1. **unavoidable** - External factors beyond control (emergency, illness, family crisis, unexpected work demand)
2. **structural** - Schedule/environment issues (poor timing, wrong location, lack of tools, unrealistic planning)
3. **energy** - Low energy, fatigue, burnout, mental exhaustion, poor sleep
4. **skill** - Task too complex, unclear next steps, overwhelm, lack of knowledge
5. **avoidance** - Procrastination, fear of failure, perfectionism, emotional resistance

Analyze the user's reason and context to determine:
- The primary deviation type
- Confidence level (0.0-1.0)
- Brief, compassionate explanation
- 2-3 actionable suggestions to prevent this in the future
- Root cause if detectable
- Whether this matches a common pattern

Respond in JSON format:
{
  "type": "one of the 5 types",
  "confidence": 0.85,
  "explanation": "Brief compassionate explanation",
  "suggestions": ["suggestion 1", "suggestion 2"],
  "rootCause": "optional deeper insight",
  "patternMatch": "optional pattern name"
}`;

// Fallback rule-based classifier
function ruleBasedClassify(reason: string, context: { energyLevel?: number; timeOfDay?: string }): DeviationClassification {
    const lowerReason = reason.toLowerCase();

    // Unavoidable indicators
    if (lowerReason.includes('emergency') || lowerReason.includes('sick') ||
        lowerReason.includes('illness') || lowerReason.includes('doctor') ||
        lowerReason.includes('family') || lowerReason.includes('urgent')) {
        return {
            type: 'unavoidable',
            confidence: 0.8,
            explanation: 'Life happens. Some things are simply beyond your control.',
            suggestions: [
                'No action needed - this was the right call',
                'Consider adding buffer time for unexpected events',
            ],
        };
    }

    // Energy indicators
    if (lowerReason.includes('tired') || lowerReason.includes('exhausted') ||
        lowerReason.includes('no energy') || lowerReason.includes('sleepy') ||
        lowerReason.includes('burnout') || (context.energyLevel && context.energyLevel <= 2)) {
        return {
            type: 'energy',
            confidence: 0.85,
            explanation: 'Your body needed rest. Pushing through low energy often backfires.',
            suggestions: [
                'Schedule demanding tasks during your peak energy hours',
                'Consider shorter work blocks when energy is low',
                'Check sleep patterns - are you getting enough rest?',
            ],
            patternMatch: context.energyLevel && context.energyLevel <= 2 ? 'Low Energy Day' : undefined,
        };
    }

    // Structural indicators
    if (lowerReason.includes('wrong time') || lowerReason.includes('schedule') ||
        lowerReason.includes('meeting') || lowerReason.includes('interrupted') ||
        lowerReason.includes('forgot') || lowerReason.includes('too short') ||
        lowerReason.includes('no time')) {
        return {
            type: 'structural',
            confidence: 0.75,
            explanation: 'This looks like a planning or scheduling issue, not a personal failure.',
            suggestions: [
                'Review when this task is scheduled - is the timing realistic?',
                'Add buffer time between activities',
                'Consider blocking distractions during focus time',
            ],
        };
    }

    // Skill indicators
    if (lowerReason.includes('hard') || lowerReason.includes('confusing') ||
        lowerReason.includes('stuck') || lowerReason.includes('overwhelm') ||
        lowerReason.includes("don't know") || lowerReason.includes('complicated')) {
        return {
            type: 'skill',
            confidence: 0.7,
            explanation: 'Some tasks need to be broken down or clarified before starting.',
            suggestions: [
                'Break this into smaller, clearer subtasks',
                'Identify the very first tiny step you can take',
                'Consider if you need additional resources or help',
            ],
            rootCause: 'Task may be too complex or undefined',
        };
    }

    // Avoidance indicators
    if (lowerReason.includes("didn't feel like") || lowerReason.includes('procrastinat') ||
        lowerReason.includes('afraid') || lowerReason.includes('anxious') ||
        lowerReason.includes('perfect') || lowerReason.includes('later') ||
        lowerReason.includes('distract')) {
        return {
            type: 'avoidance',
            confidence: 0.7,
            explanation: 'Resistance is normal. Understanding why helps move forward.',
            suggestions: [
                'Try the "2-minute start" - just begin for 2 minutes',
                'Explore what emotion is behind the resistance',
                'Lower the bar - what\'s the minimum viable version?',
            ],
            patternMatch: 'Avoidance Pattern',
        };
    }

    // Default to structural
    return {
        type: 'structural',
        confidence: 0.5,
        explanation: 'Not sure what happened here. Let\'s figure it out.',
        suggestions: [
            'Reflect on what specifically got in the way',
            'Adjust the schedule if needed',
        ],
    };
}

// POST - Classify and log a deviation
export const POST = secureApiRoute(
    async (context, body) => {
        const validation = validateRequiredFields(body, ['block_id', 'reason']);
        if (!validation.valid) {
            return apiError(`Missing required fields: ${validation.missing.join(', ')}`);
        }

        const { block_id, reason, energy_level, use_ai = true } = body as {
            block_id: string;
            reason: string;
            energy_level?: number;
            use_ai?: boolean;
        };

        const supabase = await createClient();

        // Get block details
        const { data: block, error: blockError } = await supabase
            .from('schedule_blocks')
            .select('*, goal:goals(*)')
            .eq('id', block_id)
            .eq('user_id', context.userId)
            .single();

        if (blockError || !block) {
            return apiError('Block not found', 404);
        }

        let classification: DeviationClassification;

        // Try AI classification first
        if (use_ai && process.env.GROQ_API_KEY) {
            try {
                const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

                const aiContext = `
Block: ${block.goal?.title || block.context || 'Scheduled activity'}
Time: ${block.start_time} - ${block.end_time}
User's reason: ${reason}
Energy level today: ${energy_level || 'unknown'}/5
`;

                const completion = await groq.chat.completions.create({
                    model: 'llama-3.3-70b-versatile',
                    messages: [
                        { role: 'system', content: DEVIATION_CLASSIFIER_PROMPT },
                        { role: 'user', content: aiContext },
                    ],
                    temperature: 0.3,
                    max_tokens: 500,
                });

                const responseText = completion.choices[0]?.message?.content || '';
                const jsonMatch = responseText.match(/\{[\s\S]*\}/);

                if (jsonMatch) {
                    classification = JSON.parse(jsonMatch[0]) as DeviationClassification;
                } else {
                    throw new Error('No JSON in response');
                }
            } catch (aiError) {
                console.error('AI classification failed:', aiError);
                // Fall back to rule-based
                classification = ruleBasedClassify(reason, {
                    energyLevel: energy_level,
                    timeOfDay: block.start_time,
                });
            }
        } else {
            // Use rule-based classifier
            classification = ruleBasedClassify(reason, {
                energyLevel: energy_level,
                timeOfDay: block.start_time,
            });
        }

        // Save to block_logs
        const { data: logEntry, error: logError } = await supabase
            .from('block_logs')
            .upsert({
                block_id,
                user_id: context.userId,
                log_date: block.date,
                status: 'missed',
                reason,
                deviation_type: classification.type,
                ai_analysis: {
                    classification,
                    processed_at: new Date().toISOString(),
                    method: use_ai && process.env.GROQ_API_KEY ? 'ai' : 'rule-based',
                },
            }, {
                onConflict: 'block_id,user_id,log_date',
            })
            .select()
            .single();

        if (logError) {
            console.error('Failed to save block log:', logError);
            return apiError('Failed to save deviation log', 500);
        }

        // Update block status
        await supabase
            .from('schedule_blocks')
            .update({ status: 'missed' })
            .eq('id', block_id);

        return apiSuccess({
            classification,
            log: logEntry,
            message: 'Deviation classified and logged',
        });
    },
    { requireAuth: true, auditAction: 'deviation_classify' }
);

// GET - List deviations with patterns
export const GET = secureApiRoute(
    async (context) => {
        const { searchParams } = new URL(context.request.url);
        const startDate = searchParams.get('start_date');
        const endDate = searchParams.get('end_date');
        const deviationType = searchParams.get('type');

        const supabase = await createClient();

        let query = supabase
            .from('block_logs')
            .select('*, block:schedule_blocks(*, goal:goals(*))')
            .eq('user_id', context.userId)
            .not('deviation_type', 'is', null)
            .order('log_date', { ascending: false });

        if (startDate) {
            query = query.gte('log_date', startDate);
        }
        if (endDate) {
            query = query.lte('log_date', endDate);
        }
        if (deviationType && DEVIATION_TYPES.includes(deviationType as DeviationType)) {
            query = query.eq('deviation_type', deviationType);
        }

        const { data: logs, error } = await query.limit(50);

        if (error) {
            return apiError('Failed to fetch deviation logs', 500);
        }

        // Calculate patterns
        const patterns = {
            byType: DEVIATION_TYPES.reduce((acc, type) => {
                acc[type] = logs?.filter(l => l.deviation_type === type).length || 0;
                return acc;
            }, {} as Record<DeviationType, number>),
            total: logs?.length || 0,
            mostCommon: '',
        };

        if (patterns.total > 0) {
            patterns.mostCommon = Object.entries(patterns.byType)
                .sort(([, a], [, b]) => b - a)[0][0];
        }

        return apiSuccess({
            logs,
            patterns,
        });
    },
    { requireAuth: true }
);
