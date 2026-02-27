import { runAI } from './run-ai';
import { createClient } from '@/lib/supabase/server';
import { SchedulePatch } from '@/lib/calendar/types';

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
    patch?: SchedulePatch;
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

        // 1. Initial Insert (Raw Dump)
        const { data: dumpRecord, error: insertError } = await supabase
            .from('brain_dumps')
            .insert({
                user_id: this.userId,
                raw_text: rawText,
                processed: false
            })
            .select()
            .single();

        if (insertError) throw new Error('Failed to save brain dump');

        // 2. Gather Context
        const context = await this.gatherContext();

        // 3. AI Processing
        // Correct runAI signature: channel, input, context, userId
        const aiResponse = await runAI({
            channel: 'brain_dump',
            input: rawText,
            context: context,
            userId: this.userId,
            timeout: 25000 // A bit more for heavy extraction
        } as any);

        // 4. Transform to UI Model
        const result: BrainDumpResult = {
            mode: aiResponse.mode === 'ask' ? 'ask' : 'propose',
            summary: aiResponse.summary || '',
            extracted: {
                summary: aiResponse.summary || '',
                items: aiResponse.extracted?.items || [],
                constraints: aiResponse.extracted?.constraints || [],
                signals: {
                    energy: aiResponse.extracted?.signals?.energy,
                    overwhelm: aiResponse.extracted?.signals?.overwhelm,
                    stress: aiResponse.extracted?.signals?.stress,
                    motivation: aiResponse.extracted?.signals?.motivation,
                    health_flag: aiResponse.extracted?.signals?.health_flag
                }
            },
            options: (aiResponse.options || []).map((opt: any) => ({
                id: opt.id,
                label: opt.title,
                explanation: opt.impact,
                type: (opt as any).type || 'add_task',
                data: (opt as any).data || {},
                patch: opt.patch
            })),
            question: aiResponse.question ? {
                prompt: aiResponse.question.prompt,
                choices: aiResponse.question.choices || []
            } : undefined,
            potentialGoals: (aiResponse as any).potentialGoals || []
        };

        // 5. Update Dump Record
        await supabase.from('brain_dumps').update({
            processed: true,
            processed_at: new Date().toISOString(),
            extracted_items: result.extracted.items
        }).eq('id', dumpRecord.id);

        // 6. Save individual items
        if (result.extracted.items.length > 0) {
            const itemsToSave = result.extracted.items.map((item: any) => ({
                brain_dump_id: dumpRecord.id,
                user_id: this.userId,
                category: item.kind,
                content: item.title,
                entities: {
                    est_min: item.est_min,
                    urgency: item.urgency,
                    pillar: item.pillar
                },
                status: 'pending'
            }));
            await supabase.from('brain_dump_items').insert(itemsToSave);
        }

        // 7. Save potential goals
        if (result.potentialGoals && result.potentialGoals.length > 0) {
            const goalsToSave = result.potentialGoals.map((g: any) => ({
                user_id: this.userId,
                title: g.title,
                pillar: g.pillar,
                source_items: [dumpRecord.id]
            }));
            await supabase.from('potential_goals').insert(goalsToSave);
        }

        // 8. Map options (inject dump ID for tracking)
        result.options = result.options.map(opt => ({
            ...opt,
            data: { ...opt.data, brain_dump_id: dumpRecord.id }
        }));

        return result;
    }

    private async gatherContext() {
        const supabase = await createClient();
        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', this.userId)
            .single();

        const { data: goals } = await supabase
            .from('goals')
            .select('title, pillar')
            .eq('user_id', this.userId)
            .eq('is_active', true);

        return {
            profile,
            goals: goals || []
        };
    }
}
