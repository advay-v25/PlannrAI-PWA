/**
 * 🧠 PLANNRAI — BRAIN DUMP PROCESSOR
 * Processes free-form text through AI to extract tasks, emotions, constraints.
 * Uses the unified AI client for reliable processing.
 */

import { callAI } from '@/lib/ai/unified-client';
import { createClient } from '@/lib/supabase/server';

interface BrainDumpSignal {
    energy?: number;
    overwhelm?: number;
    stress?: number;
    motivation?: number;
    health_flag?: boolean;
}

interface BrainDumpAction {
    id: string;
    label: string;
    explanation: string;
    type: 'add_task' | 'start_coaching' | 'rebalance_day' | 'create_routine';
    data: any;
    patch?: any;
}

interface BrainDumpResult {
    mode: 'propose' | 'ask';
    summary: string;
    extracted: {
        summary: string;
        items: any[];
        constraints: any[];
        signals: BrainDumpSignal;
    };
    options: BrainDumpAction[];
    question?: {
        prompt: string;
        choices: string[];
    };
    potentialGoals?: any[];
}

export class BrainDumpProcessor {
    private userId: string;

    constructor(userId: string) {
        this.userId = userId;
    }

    async process(rawText: string): Promise<BrainDumpResult> {
        const supabase = await createClient();

        // 1. Save raw dump
        let dumpId: string | null = null;
        try {
            const { data: dumpRecord } = await supabase
                .from('brain_dumps')
                .insert({
                    user_id: this.userId,
                    raw_text: rawText,
                    processed: false
                })
                .select('id')
                .single();
            dumpId = dumpRecord?.id || null;
        } catch (e) {
            console.warn('[BrainDump] Failed to save raw dump, continuing:', e);
        }

        // 2. Gather context
        const context = await this.gatherContext();

        // 3. AI Processing
        const systemPrompt = `You are PlannrAI's brain dump processor. Parse user's free-form text into actionable items.

CATEGORIES:
- task: Something to do (call someone, complete work, buy things)
- constraint: Time blocker ("busy at 3pm", "meeting tomorrow")
- emotion: How they feel ("stressed about...", "excited for...")
- energy: Energy state ("exhausted", "pumped up")
- desire: Want to do ("should start...", "wish I could...")
- insight: Self-observation ("I notice that...", "I work best when...")
- reminder: Don't forget ("remember to...", "don't forget...")

CONTEXT:
User: ${context.profile?.first_name || 'User'}
Active Goals: ${context.goals?.map((g: any) => g.title).join(', ') || 'None'}

RULES:
1. Extract EVERY distinct thought/item
2. Assign confidence (0.0-1.0)
3. Suggest actions for tasks
4. Detect emotional signals
5. If user seems overwhelmed, suggest rebalancing
6. Return valid JSON only`;

        const userPrompt = `Parse this brain dump:

"${rawText}"

OUTPUT FORMAT:
{
  "mode": "propose",
  "summary": "Brief summary of what was captured",
  "extracted": {
    "summary": "One-line overview",
    "items": [
      {
        "title": "Call dentist",
        "kind": "task",
        "confidence": 0.95,
        "urgency": "medium",
        "est_min": 15,
        "pillar": "self"
      }
    ],
    "constraints": [
      {
        "description": "Busy 3-5pm tomorrow",
        "date": "tomorrow",
        "time_range": "15:00-17:00"
      }
    ],
    "signals": {
      "energy": 3,
      "overwhelm": 2,
      "stress": 4,
      "motivation": 3,
      "health_flag": false
    }
  },
  "options": [
    {
      "id": "schedule_tasks",
      "title": "Schedule extracted tasks",
      "impact": "Get 3 tasks onto your calendar",
      "type": "add_task"
    }
  ],
  "potentialGoals": []
}`;

        const response = await callAI<any>({
            prompt: userPrompt,
            systemPrompt,
            model: 'fast',
            temperature: 0.4,
            maxTokens: 2000,
            requireJSON: true,
            timeout: 20000,
        });

        // 4. Transform result
        let result: BrainDumpResult;

        if (response.success && response.data) {
            const ai = response.data;
            result = {
                mode: ai.mode === 'ask' ? 'ask' : 'propose',
                summary: ai.summary || 'Processed your brain dump.',
                extracted: {
                    summary: ai.extracted?.summary || ai.summary || '',
                    items: ai.extracted?.items || [],
                    constraints: ai.extracted?.constraints || [],
                    signals: {
                        energy: ai.extracted?.signals?.energy,
                        overwhelm: ai.extracted?.signals?.overwhelm,
                        stress: ai.extracted?.signals?.stress,
                        motivation: ai.extracted?.signals?.motivation,
                        health_flag: ai.extracted?.signals?.health_flag,
                    },
                },
                options: (ai.options || []).map((opt: any) => ({
                    id: opt.id || `opt_${Math.random().toString(36).slice(2, 6)}`,
                    label: opt.title || opt.label || 'Action',
                    explanation: opt.impact || opt.explanation || '',
                    type: opt.type || 'add_task',
                    data: opt.data || {},
                    patch: opt.patch,
                })),
                question: ai.question,
                potentialGoals: ai.potentialGoals || [],
            };
        } else {
            // Fallback: basic extraction
            result = {
                mode: 'propose',
                summary: 'Captured your brain dump.',
                extracted: {
                    summary: rawText.slice(0, 100),
                    items: [{
                        title: rawText.slice(0, 50),
                        kind: 'task',
                        confidence: 0.5,
                        urgency: 'medium',
                        est_min: 30,
                        pillar: 'craft',
                    }],
                    constraints: [],
                    signals: {},
                },
                options: [],
                potentialGoals: [],
            };
        }

        // 5. Update dump record
        if (dumpId) {
            try {
                await supabase.from('brain_dumps').update({
                    processed: true,
                    processed_at: new Date().toISOString(),
                    extracted_items: result.extracted.items,
                }).eq('id', dumpId);
            } catch (e) {
                console.warn('[BrainDump] Failed to update dump record:', e);
            }

            // Save items
            if (result.extracted.items.length > 0) {
                try {
                    const itemsToSave = result.extracted.items.map((item: any) => ({
                        brain_dump_id: dumpId,
                        user_id: this.userId,
                        category: item.kind || 'task',
                        content: item.title,
                        entities: {
                            est_min: item.est_min,
                            urgency: item.urgency,
                            pillar: item.pillar,
                        },
                        status: 'pending',
                    }));
                    await supabase.from('brain_dump_items').insert(itemsToSave);
                } catch (e) {
                    console.warn('[BrainDump] Failed to save items:', e);
                }
            }

            // Inject dump ID into options
            result.options = result.options.map(opt => ({
                ...opt,
                data: { ...opt.data, brain_dump_id: dumpId },
            }));
        }

        return result;
    }

    private async gatherContext() {
        try {
            const supabase = await createClient();

            const [profileRes, goalsRes] = await Promise.all([
                supabase.from('profiles').select('first_name, sleep_start, sleep_end').eq('id', this.userId).maybeSingle(),
                supabase.from('goals').select('title, pillar').eq('user_id', this.userId).eq('status', 'active').limit(10),
            ]);

            return {
                profile: profileRes.data,
                goals: goalsRes.data || [],
            };
        } catch (e) {
            return { profile: null, goals: [] };
        }
    }
}
