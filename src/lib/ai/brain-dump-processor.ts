/**
 * 🧠 PLANNRAI — BRAIN DUMP PROCESSOR
 * AI-powered thought processor that validates emotions, organizes chaos,
 * and generates actionable schedule patches.
 */

import { callAI } from '@/lib/ai/unified-client';
import { buildBrainDumpContext, BrainDumpContext } from '@/lib/brain-dump/brain-dump-context';
import { getTemplateById } from '@/lib/brain-dump/brain-dump-templates';
import { SupabaseClient } from '@supabase/supabase-js';

// ============ RESPONSE TYPES ============

export interface BrainDumpResponse {
    validation: {
        acknowledgment: string;
        reflection: string;
    };
    organized: {
        immediate_actions?: OrganizedSection;
        ideas_to_save?: OrganizedSection;
        emotional_notes?: OrganizedSection;
        schedule_adjustments?: OrganizedSection;
    };
    options: BrainDumpOption[];
    escalations?: {
        coach?: string;
        goals?: string;
        settings?: string;
    };
}

export interface OrganizedSection {
    title: string;
    items: string[];
    suggestion: string;
}

export interface BrainDumpOption {
    id: string;
    label: string;
    summary: string;
    actions: {
        calendar_changes?: {
            blocks_to_add: number;
            blocks_to_move: number;
            blocks_to_remove: number;
            time_freed: number;
        };
        goal_suggestions?: string[];
        other_suggestions?: string[];
    };
    patch_ops: PatchOp[];
    emotional_fit: 'gentle' | 'moderate' | 'aggressive';
    recommended: boolean;
}

export interface PatchOp {
    op: 'add' | 'update' | 'delete';
    block: {
        id?: string;
        date?: string;
        start_time?: string;
        end_time?: string;
        title?: string;
        type?: string;
        block_type?: string;
        status?: string;
        goal_id?: string;
        pillar?: string;
    };
}

// ============ SYSTEM PROMPT ============

function buildSystemPrompt(style: string): string {
    return `You are PlannrAI's Brain Dump processor — an empathetic, intelligent thought organizer.

## YOUR ROLE

You help users process the chaos of their thoughts and adapt their schedule to reality. Users come to you when:
- Plans have derailed (unexpected events, energy crashes, life happens)
- They're overwhelmed and need relief
- They have random ideas/tasks bouncing around their head
- They're emotional and need validation + solutions

You are NOT a productivity coach. You are a **compassionate reality adapter**.

## YOUR CORE PRINCIPLES

1. **VALIDATE FIRST, SOLVE SECOND** — Always acknowledge the user's emotional state. Never dismiss feelings.
2. **ORGANIZE CHAOS INTO CLARITY** — Extract distinct items, categorize them.
3. **OFFER CHOICES, NOT COMMANDS** — Provide 2-3 options with clear trade-offs.
4. **BRIDGE PLANS AND REALITY** — User's schedule is aspirational; what they're telling you is the truth.
5. **KNOW WHEN TO ESCALATE** — Chronic overwhelm → suggest Settings. Goal frustration → suggest Coach.
6. **RESPECT PRIVACY** — This is ephemeral processing. No judgment.

## USER STYLE: ${style.toUpperCase()}

${style === 'gentle' ? `- Extensive emotional validation
- Always frame as suggestions: "Would you like to...", "I could...", "Here are some options..."
- Never push back. Emphasize choice and autonomy.` :
style === 'directive' ? `- Brief emotional validation
- Strong recommendations: "I'm reducing your load", "You need to..."
- Direct pushback if needed. Focus on solutions over feelings.` :
`- Moderate emotional validation
- Make clear recommendations: "I recommend...", "The best option is..."
- Gentle pushback if user pattern is concerning. Balance empathy with action.`}

## YOUR OUTPUT FORMAT (strict JSON)

{
  "validation": {
    "acknowledgment": "One sentence validating the user's emotional state",
    "reflection": "One sentence reflecting back what you heard"
  },
  "organized": {
    "immediate_actions": { "title": "...", "items": ["..."], "suggestion": "..." },
    "ideas_to_save": { "title": "...", "items": ["..."], "suggestion": "..." },
    "emotional_notes": { "title": "...", "items": ["..."], "suggestion": "..." },
    "schedule_adjustments": { "title": "...", "items": ["..."], "suggestion": "..." }
  },
  "options": [
    {
      "id": "option_1",
      "label": "Short option name",
      "summary": "One sentence explaining this approach",
      "actions": {
        "calendar_changes": { "blocks_to_add": 0, "blocks_to_move": 0, "blocks_to_remove": 0, "time_freed": 0 },
        "goal_suggestions": [],
        "other_suggestions": []
      },
      "patch_ops": [
        { "op": "add|update|delete", "block": { "date": "YYYY-MM-DD", "start_time": "HH:MM", "end_time": "HH:MM", "title": "...", "type": "ad_hoc|goal_block|buffer|anchor", "status": "planned", "id": "existing-block-id" } }
      ],
      "emotional_fit": "gentle|moderate|aggressive",
      "recommended": true|false
    }
  ],
  "escalations": {
    "coach": "Suggestion to talk to Coach (optional)",
    "goals": "Suggestion about goal adjustments (optional)",
    "settings": "Suggestion about baseline schedule (optional)"
  }
}

## CRITICAL RULES

1. ALWAYS validate emotions first — never skip the validation section
2. ONLY include organized sections that are relevant — omit empty categories
3. ALWAYS provide 2-3 options — give user choice
4. Mark ONE option as recommended
5. patch_ops MUST use block IDs from the schedule when modifying/deleting existing blocks
6. NEVER move/delete anchor or commitment blocks (is_fixed: true or has commitment_id)
7. All times in 24h HH:MM format, all dates in YYYY-MM-DD format
8. Consider time of day — if it's evening, don't suggest morning changes
9. For "add" ops, include date, start_time, end_time, title, type, status
10. For "update" ops, include block id and only the fields being changed
11. For "delete" ops, include only the block id
12. Be concise — user is overwhelmed, don't add to it with walls of text
13. Only return valid JSON — no markdown, no explanation outside JSON`;
}

// ============ USER PROMPT BUILDER ============

function buildUserPrompt(ctx: BrainDumpContext): string {
    const todayText = ctx.current_schedule.today.length > 0
        ? ctx.current_schedule.today.map(b =>
            `  ${b.start_time}–${b.end_time}: "${b.title}" [${b.block_type}] (${b.status})${b.is_fixed || b.commitment_id ? ' 🔒LOCKED' : ''} ID:${b.id}`
        ).join('\n')
        : '  (No blocks today)';

    const tomorrowText = ctx.current_schedule.tomorrow.length > 0
        ? ctx.current_schedule.tomorrow.slice(0, 8).map(b =>
            `  ${b.start_time}–${b.end_time}: "${b.title}" [${b.block_type}] ID:${b.id}`
        ).join('\n')
        : '  (No blocks tomorrow)';

    const goalsText = ctx.active_goals.length > 0
        ? ctx.active_goals.map(g =>
            `  - "${g.title}" (${g.pillar}, ${g.weekly_target_minutes}min/wk, priority: ${g.priority}) ID:${g.id}`
        ).join('\n')
        : '  (No goals)';

    const commitmentsText = ctx.commitments.length > 0
        ? ctx.commitments.map(c =>
            `  - "${c.title}" ${c.start_time}–${c.end_time} on ${c.days_of_week.join(', ')} 🔒`
        ).join('\n')
        : '  (No commitments)';

    const templateCtx = ctx.template_triggered
        ? `\nTemplate triggered: ${ctx.template_triggered}\n`
        : '';

    return `━━━ CURRENT STATE ━━━
Date: ${ctx.current_date} (${ctx.day_of_week})
Time: ${ctx.current_time}
User: ${ctx.user_preferences.first_name}
Energy: ${ctx.user_preferences.energy_level}/10
Stress: ${ctx.user_preferences.stress_level}/10
Chronotype: ${ctx.user_preferences.chronotype}
Sleep: ${ctx.user_preferences.wake_time} wake → ${ctx.user_preferences.sleep_time} sleep

━━━ QUICK STATS ━━━
Completed today: ${ctx.quick_stats.blocks_completed_today}
Missed today: ${ctx.quick_stats.blocks_missed_today}
Remaining blocks: ${ctx.quick_stats.blocks_remaining_today}
Minutes remaining: ${ctx.quick_stats.minutes_remaining_today}

━━━ TODAY'S SCHEDULE (${ctx.current_date}) ━━━
${todayText}

━━━ TOMORROW'S SCHEDULE ━━━
${tomorrowText}

━━━ ACTIVE GOALS ━━━
${goalsText}

━━━ FIXED COMMITMENTS (🔒 NEVER MODIFY) ━━━
${commitmentsText}
${templateCtx}
━━━ BRAIN DUMP ━━━
"${ctx.dump_text}"

Process this dump. Return valid JSON only.`;
}

// ============ FALLBACK RESPONSE ============

function generateFallbackResponse(ctx: BrainDumpContext): BrainDumpResponse {
    const remaining = ctx.current_schedule.today.filter(b =>
        b.status === 'planned' && !b.is_fixed && !b.commitment_id
    );
    const removable = remaining.slice(-2);

    const deleteOps: PatchOp[] = removable.map(b => ({
        op: 'delete' as const,
        block: { id: b.id },
    }));

    const moveOps: PatchOp[] = remaining.map(b => ({
        op: 'delete' as const,
        block: { id: b.id },
    }));

    return {
        validation: {
            acknowledgment: "I hear that you're going through a lot right now.",
            reflection: "Let me help you organize your thoughts and adjust your schedule.",
        },
        organized: {},
        options: [
            {
                id: 'lighten_load',
                label: 'Lighten Your Load',
                summary: `Remove ${removable.length} flexible tasks and add breathing room`,
                actions: {
                    calendar_changes: {
                        blocks_to_remove: removable.length,
                        blocks_to_add: 0,
                        blocks_to_move: 0,
                        time_freed: removable.reduce((s, b) => {
                            const [sh, sm] = b.start_time.split(':').map(Number);
                            const [eh, em] = b.end_time.split(':').map(Number);
                            return s + (eh * 60 + em) - (sh * 60 + sm);
                        }, 0),
                    },
                },
                patch_ops: deleteOps,
                emotional_fit: 'gentle',
                recommended: true,
            },
            {
                id: 'keep_essentials',
                label: 'Keep Only Essentials',
                summary: 'Keep anchors only, clear all flexible work',
                actions: {
                    calendar_changes: {
                        blocks_to_remove: remaining.length,
                        blocks_to_add: 0,
                        blocks_to_move: 0,
                        time_freed: remaining.reduce((s, b) => {
                            const [sh, sm] = b.start_time.split(':').map(Number);
                            const [eh, em] = b.end_time.split(':').map(Number);
                            return s + (eh * 60 + em) - (sh * 60 + sm);
                        }, 0),
                    },
                },
                patch_ops: moveOps,
                emotional_fit: 'moderate',
                recommended: false,
            },
        ],
        escalations: {
            coach: "If this feeling persists, consider talking to Coach about your overall schedule intensity.",
        },
    };
}

// ============ MAIN PROCESSOR ============

export async function processBrainDump(
    userId: string,
    dumpText: string,
    supabase: SupabaseClient,
    templateTriggered?: string
): Promise<BrainDumpResponse> {
    // 1. Auto-enrich from template if triggered
    let enrichedText = dumpText;
    if (templateTriggered) {
        const template = getTemplateById(templateTriggered);
        if (template) {
            enrichedText = template.pre_prompt + (dumpText ? `\n\nAdditional context: ${dumpText}` : '');
        }
    }

    // 2. Build context
    const ctx = await buildBrainDumpContext(userId, supabase, enrichedText, templateTriggered);

    // 3. Build prompts
    const systemPrompt = buildSystemPrompt(ctx.user_preferences.brain_dump_style);
    const userPrompt = buildUserPrompt(ctx);

    // 4. Call AI
    try {
        const response = await callAI<BrainDumpResponse>({
            prompt: userPrompt,
            systemPrompt,
            model: 'smart',
            temperature: 0.6,
            maxTokens: 3500,
            requireJSON: true,
            timeout: 20000,
        });

        if (response.success && response.data) {
            const result = response.data;

            // Validate: ensure required fields exist
            if (!result.validation?.acknowledgment) {
                result.validation = {
                    acknowledgment: "I hear you.",
                    reflection: "Let me help process that.",
                };
            }

            // Ensure at least 2 options
            if (!result.options || result.options.length < 2) {
                console.warn('[BrainDump] AI returned fewer than 2 options, using fallback');
                return generateFallbackResponse(ctx);
            }

            // Ensure one is recommended
            if (!result.options.some(o => o.recommended)) {
                result.options[0].recommended = true;
            }

            // Ensure patch_ops arrays exist
            for (const opt of result.options) {
                if (!opt.patch_ops) opt.patch_ops = [];
                if (!opt.actions) opt.actions = {};
                if (!opt.emotional_fit) opt.emotional_fit = 'gentle';
            }

            // Clean empty organized sections
            if (result.organized) {
                for (const key of Object.keys(result.organized)) {
                    const section = (result.organized as any)[key];
                    if (!section || !section.items || section.items.length === 0) {
                        delete (result.organized as any)[key];
                    }
                }
            }

            return result;
        }

        console.warn('[BrainDump] AI returned unsuccessful response, using fallback');
        return generateFallbackResponse(ctx);

    } catch (error) {
        console.error('[BrainDump] Processing error:', error);
        return generateFallbackResponse(ctx);
    }
}
