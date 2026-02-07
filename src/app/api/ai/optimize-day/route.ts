import { NextRequest, NextResponse } from 'next/server';
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { generateAIResponse } from '@/lib/ai/groq-client';
import { addMinutes, format, parse, set, isBefore, isAfter, getDay } from 'date-fns';
import { BioRegulator } from '@/lib/scheduling/bio-regulator';

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
        const targetDate = new Date(date);
        const dayOfWeek = getDay(targetDate); // 0=Sun, 1=Mon...

        // ---------------------------------------------------------
        // 1. FETCH DATA (Skeleton Components)
        // ---------------------------------------------------------

        // Fetch User Profile (Sleep, Meals)
        const { data: profile } = await supabase
            .from('profiles')
            .select('sleep_start, sleep_end, meal_preferences')
            .eq('id', context.userId)
            .single();

        // Fetch Commitments (Anchors)
        const { data: commitments } = await supabase
            .from('commitments')
            .select('*')
            .eq('user_id', context.userId)
            .contains('days_of_week', [dayOfWeek])
            .eq('is_active', true);

        // Fetch Goals
        const { data: allGoals } = await supabase
            .from('goals')
            .select('*')
            .eq('user_id', context.userId)
            .eq('status', 'active');

        // BIO-REGULATOR: FILTER GOALS
        // If I have low energy, I shouldn't even TRY to schedule heavy goals.
        const validGoals = BioRegulator.filterGoalsByBioState(allGoals || [], energyLevel);
        const droppedGoalsCount = (allGoals?.length || 0) - validGoals.length;

        const skeleton: TimeBlock[] = [];

        // ---------------------------------------------------------
        // 2. BUILD SKELETON (Step 1 & 2)
        // ---------------------------------------------------------

        // A. SLEEP (Level 0)
        const sleepStart = profile?.sleep_start || "22:00";
        const sleepEnd = profile?.sleep_end || "07:00";

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
        const meals = profile?.meal_preferences as any || { breakfast: "08:00", lunch: "13:00", dinner: "19:00" };
        const addMeal = (name: string, time: string, duration: number) => {
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
        const prompt = `
YOU ARE THE "TETRIS ENGINE" (Level 2).
Mission: Fit flexible goal blocks into the available time skeleton.

CONTEXT:
Date: ${date}
${bioFragment}

HIERARCHY (ALREADY PLACED - DO NOT MOVE):
${skeleton.map(b => `[${b.type.toUpperCase()}] ${b.title}: ${b.start_time}-${b.end_time}`).join('\n')}

FLEXIBLE GOALS TO PLACE (Level 3):
${validGoals.map(g => `- [ID:${g.id}] ${g.title} (${g.minutes_per_day}m, ${g.importance}, ${g.energy_demand})`).join('\n')}

RULES:
1. RESPECT THE SKELETON. Do not schedule over Sleep, Anchors, or Meals.
2. BUFFER. Leave 10m buffer after deep work.
3. PRIORITY. If not enough time, drop Low priority goals first.
4. REALISM. Don't split blocks smaller than 30m unless needed.

OUTPUT FORMAT (JSON):
{
  "optimizedBlocks": [
    { "id": "uuid header or new", "title": "...", "start_time": "HH:MM", "end_time": "HH:MM", "type": "...", "reason": "..." }
  ],
  "droppedGoals": ["Title of goal not scheduled"],
  "summary": "Brief explanation"
}
`;
        try {
            const response = await generateAIResponse(prompt, 'COACH', context.userId, true);
            let result;
            try {
                result = JSON.parse(response);
            } catch {
                const match = response.match(/\{[\s\S]*\}/);
                if (match) result = JSON.parse(match[0]);
                else throw new Error("Invalid JSON");
            }

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
                console.error("AI returned invalid format:", result);
                return apiError("AI failed to generate a valid schedule. Try again.", 422);
            }

            // DB Transaction
            const { error: deleteError } = await supabase
                .from('schedule_blocks')
                .delete()
                .eq('user_id', context.userId)
                .eq('date', date)
                .neq('status', 'done');

            if (deleteError) {
                console.error("Delete error:", deleteError);
                throw deleteError;
            }

            const newBlocks = optimizedBlocks.map((b: any) => {
                // Normalize time to HH:MM (strip AM/PM if present)
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

                return {
                    user_id: context.userId,
                    date: date,
                    start_time: start,
                    end_time: end,
                    title: b.title,
                    context: b.title,
                    block_type: b.type || 'goal',
                    status: 'planned',
                    goal_id: b.id
                };
            }).map((b: any) => {
                // Ensure goal_id is a valid UUID if present
                if (!b.goal_id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.goal_id)) {
                    return { ...b, goal_id: null };
                }
                return b;
            }).filter(b => b.start_time && b.end_time); // Safety filter

            if (newBlocks.length === 0 && optimizedBlocks.length > 0) {
                console.error("No valid blocks could be parsed from AI response:", optimizedBlocks);
                return apiError(`Failed to parse time format from AI. Please try again.`, 422);
            }

            const { data: insertedData, error: insertError } = await supabase
                .from('schedule_blocks')
                .insert(newBlocks)
                .select();

            if (insertError) {
                console.error("Insert error:", insertError);
                throw insertError;
            }

            return apiSuccess({
                optimizedBlocks: insertedData,
                summary: result.summary,
                message: warningMessage || "Schedule optimized.",
                droppedGoals
            });

        } catch (error: any) {
            console.error("Critical Optimization Failure:", error);
            return apiError(error.message || "Optimization failed. Try again.", 422);
        }
    },
    { requireAuth: true, rateLimit: 'ai', auditAction: 'ai_optimize_day' }
);

function subtractMinutes(time: string, mins: number): string {
    const [h, m] = time.split(':').map(Number);
    const date = new Date();
    date.setHours(h, m - mins, 0);
    return format(date, 'HH:mm');
}

function addMinutesStr(time: string, mins: number): string {
    const [h, m] = time.split(':').map(Number);
    const date = new Date();
    date.setHours(h, m + mins, 0);
    return format(date, 'HH:mm');
}
