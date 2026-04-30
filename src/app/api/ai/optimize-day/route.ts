import { NextRequest, NextResponse } from 'next/server';
import { secureApiRoute } from '@/lib/security/api-protection';
import { apiSuccess, apiError, responses, API_ERROR_CODES } from '@/lib/api/api-utils';
import { createClient } from '@/lib/supabase/server';
import { groqChat } from '@/lib/ai/groq-client';
import { JSONReliability } from '@/lib/ai/json-reliability';
import { addMinutes, format, parse, set, isBefore, isAfter, getDay } from 'date-fns';
import { BioRegulator } from '@/lib/scheduling/bio-regulator';
import { z } from 'zod';

const OptimizeDayOutputSchema = z.object({
    optimizedBlocks: z.array(z.object({
        id: z.string().optional(),
        title: z.string(),
        start_time: z.string(),
        end_time: z.string(),
        type: z.string(),
        reason: z.string().optional()
    })),
    droppedGoals: z.array(z.string()).optional(),
    summary: z.string().optional()
});

// Types
interface TimeBlock {
    id?: string;
    title: string;
    start_time: string; // HH:MM
    end_time: string; // HH:MM
    type: 'sleep' | 'anchor' | 'meal' | 'buffer' | 'goal' | 'gap';
    is_fixed: boolean;
    goal_id?: string;
}

export const POST = secureApiRoute(
    async (context, body) => {
        const { date, blocks: currentBlocks, energyLevel } = body as {
            date: string;
            blocks: any[]; // Existing blocks to preserve context if needed
            energyLevel: number; // 1-5
        };

        const supabase = await createClient();

        // 1. FETCH ENRICHED CONTEXT (Resonance Engine)
        const { ContextEngine } = await import('@/lib/intelligence/context-engine');
        const intel = await ContextEngine.build(context.userId, date, supabase);

        console.log(`[Optimization] Resonance Mode: ${intel.computedMode}, Capacity: ${intel.energyCapacity}%`);

        // BIO-REGULATOR: FILTER GOALS
        const validGoals = BioRegulator.filterGoalsByBioState(intel.goals || [], energyLevel);
        const droppedGoalsCount = (intel.goals?.length || 0) - validGoals.length;

        const skeleton: TimeBlock[] = [];

        // ---------------------------------------------------------
        // 2. BUILD SKELETON (Step 1 & 2)
        // ---------------------------------------------------------

        // A. SLEEP (Level 0)
        const sleepStart = intel.profile?.sleep_start || "22:00";
        const sleepEnd = intel.profile?.sleep_end || "07:00";

        if (sleepEnd > "00:00") {
            skeleton.push({
                title: "Sleep",
                start_time: "00:00",
                end_time: sleepEnd,
                type: 'sleep',
                is_fixed: true
            });
        }
        if (sleepStart < "23:59") {
            // Level 0: Wind-down buffer (45 mins before bed)
            const windDownStart = subtractMinutes(sleepStart, 45);
            skeleton.push({
                title: "Wind Down",
                start_time: windDownStart,
                end_time: sleepStart,
                type: 'buffer',
                is_fixed: true
            });
            skeleton.push({
                title: "Sleep",
                start_time: sleepStart,
                end_time: "24:00",
                type: 'sleep',
                is_fixed: true
            });
        }

        // B. ANCHORS (Level 1)
        // Fetch Commitments (Anchors) - we still need day-specific anchors for the skeleton
        const targetDate = new Date(date);
        const dayOfWeek = getDay(targetDate);
        const { data: commitments } = await supabase
            .from('commitments')
            .select('*')
            .eq('user_id', context.userId)
            .contains('days_of_week', [dayOfWeek])
            .eq('is_active', true);

        commitments?.forEach(c => {
            skeleton.push({
                id: c.id,
                title: c.title,
                start_time: c.start_time.slice(0, 5),
                end_time: c.end_time.slice(0, 5),
                type: 'anchor',
                is_fixed: true
            });
        });

        // C. MEALS (Level 2)
        const meals = intel.profile?.meal_preferences as any || { breakfast: "08:00", lunch: "13:00", dinner: "19:00" };
        const addMeal = (name: string, time: string, duration: number) => {
            // Check if user already has an anchor with a similar name
            const alreadyPlaced = skeleton.some(s => s.title.toLowerCase().includes(name.toLowerCase()));
            if (alreadyPlaced) return;

            const end = addMinutesStr(time, duration);
            skeleton.push({
                title: name,
                start_time: time,
                end_time: end,
                type: 'meal',
                is_fixed: true
            });
        };
        addMeal("Breakfast", meals.breakfast || "08:00", 30);
        addMeal("Lunch", meals.lunch || "13:00", 45);
        addMeal("Dinner", meals.dinner || "19:00", 45);

        // ---------------------------------------------------------
        // 3. AI TETRIS (Step 3, 4, 5)
        // ---------------------------------------------------------

        const bioFragment = BioRegulator.getAIPromptFragment(energyLevel);

        // Calculate Weekly Resonance Summary
        const weeklyResonance = intel.goals.map(g => {
            const current = intel.weeklyGoalCounts[g.id] || 0;
            const target = g.days_per_week || 0;
            return `- ${g.title}: ${current}/${target} sessions this week. ${current >= target ? 'TARGET REACHED' : 'UNFINISHED'}`;
        }).join('\n');

        const prompt = `
YOU ARE THE "SUPER-INTELLIGENCE" CHIEF OF STAFF (Time Management & Flow Expert).
Mission: Optimize the user's focus flow while ensuring a balanced, high-performance weekly rhythm.

CONTEXT:
Date: ${date}
${bioFragment}
Resonance Capacity: ${intel.energyCapacity}%
Operational Mode: ${intel.computedMode.toUpperCase()}

WEEKLY STATUS (PROGRESS TOWARDS TARGETS):
${weeklyResonance}

HIERARCHY (ALREADY PLACED - DO NOT MOVE):
${skeleton.map(b => `[${b.type.toUpperCase()}] ${b.title}: ${b.start_time}-${b.end_time}`).join('\n')}

FLEXIBLE GOALS TO PLACE (ONLY IF "UNFINISHED" ABOVE):
${validGoals.map(g => `- [ID:${g.id}] ${g.title} (${g.minutes_per_day}m, ${g.importance}, ${g.energy_demand})`).join('\n')}

STRICT SCHEDULING RULES:
1. TARGETS: Do NOT schedule a goal if its weekly target is already reached (unless it is High Importance and the day is sparse).
2. BODY COHERENCE: Max ONE body-related activity per day (Gym, Football, Cardio). If "Football" is in the skeleton, do NOT schedule the "Gym" goal today.
3. BODY PILLAR BUFFER: NEVER schedule 'body' pillar activities within 2 HOURS after any meal (Breakfast, Lunch, Dinner).
4. WHITESPACE: Do not pack blocks back-to-back. Leave 15-30m "whitespace" gaps for cognitive breathing. 
5. MEAL PROTECTION: Do NOT overlap goals with Meal blocks. Meals are flexible in time but must remain uninterrupted.
6. DAY SPREAD: Spread goals throughout the day. Avoid clustering everything at the start or end. Aim for a balanced distribution (e.g. 1 morning, 1 afternoon, 1 evening).
7. WEEKEND LEVERAGE: If the user has unfinished goals and today is Sat/Sun, prioritize finishing them.
8. NO HALLUCINATIONS: Respect the skeleton EXACTLY. Do not invent anchors that are not listed.
9. DEDUPLICATION: Do NOT generate your own Breakfast, Lunch, or Dinner blocks if they are already in the skeleton. Use them as anchors.

OUTPUT FORMAT (JSON):
{
  "optimizedBlocks": [
    { "id": "uuid", "title": "...", "start_time": "HH:MM", "end_time": "HH:MM", "type": "goal|buffer|routine", "reason": "Why this slot?" }
  ],
  "droppedGoals": ["Title"],
  "summary": "Persona-driven explanation of today's flow strategy."
}
`;
        try {
            const rawText = await groqChat({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: 'You are a schedule optimizer. Output STRICT JSON only.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.3,
                max_tokens: 2000,
                userId: context.userId
            });

            if (!rawText) throw new Error('AI returned no content');

            const result = await JSONReliability.validateOrRepair(
                rawText,
                OptimizeDayOutputSchema,
                'llama-3.3-70b-versatile',
                "Ensure JSON strictly matches OptimizeDayOutputSchema."
            );

            const optimizedBlocks = result.optimizedBlocks;
            const droppedGoals = result.droppedGoals || [];

            let warningMessage = null;
            if (droppedGoalsCount > 0) {
                warningMessage = `Filtered ${droppedGoalsCount} heavy goals due to Energy Level ${energyLevel}.`;
            }
            if (droppedGoals.length > 0) {
                warningMessage = (warningMessage ? warningMessage + " " : "") + "Could not fit all remaining goals.";
            }

            if (!optimizedBlocks || !Array.isArray(optimizedBlocks)) {
                console.error("AI returned invalid format. Result keys:", Object.keys(result));
                return apiError("AI failed to generate a valid schedule. Try again.", 422, API_ERROR_CODES.VALIDATION_ERROR, { result });
            }

            // --- DEPRECATED DIRECT DB MUTATION ---
            // Previously, this deleted all non-finished blocks and brute-inserted new ones.
            // Now, we map it to Patch Ops and run it through `PatchService` (which uses `CalendarEngine`).
            // ----------------------------------------
            const { PatchService } = await import('@/lib/services/patch-service');

            // Find existing planned blocks to delete
            const { data: existingBlocks } = await supabase
                .from('schedule_blocks')
                .select('id, is_fixed, commitment_id, status')
                .eq('user_id', context.userId)
                .eq('date', date)
                .neq('status', 'done');

            const patchOps: any[] = [];

            // 1. Delete all non-fixed planned blocks
            if (existingBlocks) {
                for (const b of existingBlocks) {
                    if (!b.is_fixed && !b.commitment_id && b.status === 'planned') {
                        patchOps.push({ op: 'delete_event', event_id: b.id });
                    }
                }
            }

            // 2. Insert new blocks
            for (const b of optimizedBlocks) {
                const normalizeTime = (t: string) => {
                    if (!t) return null;
                    const clean = t.replace(/\s*[AP]M/i, '').trim();
                    if (/^\d{1,2}:\d{2}$/.test(clean)) {
                        const [h, m] = clean.split(':');
                        return `${h.padStart(2, '0')}:${m}`;
                    }
                    return null;
                };

                const start = normalizeTime(b.start_time);
                const end = normalizeTime(b.end_time);
                const allowedTypes = ['anchor', 'goal', 'meal', 'buffer', 'routine', 'sleep', 'wind_down', 'flex'];
                const safeType = allowedTypes.includes(b.type) ? b.type : 'goal';

                if (start && end) {
                    let safeGoalId = null;
                    if (b.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.id)) {
                        safeGoalId = b.id;
                    }

                    patchOps.push({
                        op: 'create_event',
                        payload: {
                            date: date,
                            start_time: start,
                            end_time: end,
                            title: b.title,
                            block_type: safeType,
                            status: 'planned',
                            goal_id: safeGoalId
                        }
                    });
                }
            }

            // 3. Apply Patch
            if (patchOps.length === 0 && optimizedBlocks.length > 0) {
                return apiError(`Failed to parse time format from AI. Please try again.`, 422, API_ERROR_CODES.VALIDATION_ERROR, { optimizedBlocks });
            }

            const patchResult = await PatchService.applyPatch(
                context.userId,
                { ops: patchOps, reason: `Optimize day: ${date}`, undoable: true, scope: 'day' },
                supabase,
                'calendar_optimize_day'
            );

            if (!patchResult.success) {
                console.warn("[Optimization] Patch validation rejected AI proposal:", patchResult.errors);
                return apiError(`AI proposed an invalid schedule that overlaps with locked blocks: ${patchResult.errors[0]}`, 422, API_ERROR_CODES.VALIDATION_ERROR);
            }

            return apiSuccess(
                {
                    optimizedBlocks: optimizedBlocks, // Send back original proposal for UI
                    summary: result.summary,
                    message: warningMessage || "Schedule optimized.",
                    droppedGoals,
                    undo_token: patchResult.undo_token
                },
                200
            );

        } catch (error: any) {
            console.error("Critical Optimization Failure:", error);
            return apiError(error.message || "Optimization failed. Try again.", 422, API_ERROR_CODES.INTERNAL_ERROR, { stack: error.stack });
        }
    },
    { requireAuth: true, rateLimit: 'ai', auditAction: 'ai_optimize_day' }
);

function subtractMinutes(time: string, mins: number): string {
    const [h, m] = time.split(':').map(Number);
    const date = new Date();
    date.setHours(h || 0, (m || 0) - mins, 0);
    return format(date, 'HH:mm');
}

function addMinutesStr(time: string, mins: number): string {
    const [h, m] = time.split(':').map(Number);
    const date = new Date();
    date.setHours(h || 0, (m || 0) + mins, 0);
    return format(date, 'HH:mm');
}
