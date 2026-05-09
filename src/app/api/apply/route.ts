import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ValidatorAgent } from '@/lib/agents/validator/validator-agent';
import { AgentContext, CalendarPatch } from '@/lib/agents/core/types';
import { ContextBuilder } from '@/lib/agents/context-builder';

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { option_id } = body;

        if (!option_id) {
            return NextResponse.json({ error: 'Option ID is required' }, { status: 400 });
        }

        // 1. Fetch Option (Patch)
        const { data: option, error: fetchError } = await supabase
            .from('agent_options')
            .select('*')
            .eq('id', option_id)
            .eq('user_id', user.id)
            .single();

        if (fetchError || !option) {
            return NextResponse.json({ error: 'Option expired or invalid' }, { status: 404 });
        }

        const patch = option.patch as CalendarPatch;

        // 2. Re-Validate (Safety first)
        // We re-build context to ensure the world hasn't changed since option generation
        const context = await ContextBuilder.build(user.id);
        const validator = new ValidatorAgent();
        const audit = await validator.run({ patch, currentSchedule: context.currentSchedule || [] }, context);

        if (!audit.valid) {
            return NextResponse.json({
                error: 'Option no longer valid',
                reason: audit.reason
            }, { status: 409 });
        }

        // 3. Execute Changes (Sequential - Pseudo Transaction)
        // Ideally this should be a DB RPC for atomicity

        for (const change of patch.changes) {
            if (change.op === 'create') {
                const { error } = await supabase.from(
                    change.data.type === 'anchor' ? 'schedule_blocks' : 'schedule_blocks' // Assuming single table for now
                ).insert({
                    user_id: user.id,
                    title: change.data.title,
                    start_time: change.data.start_time,
                    end_time: change.data.end_time,
                    is_fixed: change.data.is_fixed || false,
                    block_type: change.data.block_type || 'flex'
                });
                if (error) throw error;
            }
            else if (change.op === 'move' || change.op === 'update') {
                const targetId = change.block_id || change.data.id;
                const { error } = await supabase.from('schedule_blocks')
                    .update({
                        start_time: change.data.start_time,
                        end_time: change.data.end_time,
                        // Add other fields to update if needed
                    })
                    .eq('id', targetId)
                    .eq('user_id', user.id);
                if (error) throw error;
            }
            else if (change.op === 'delete') {
                const targetId = change.block_id || change.data.id;
                const { error } = await supabase.from('schedule_blocks')
                    .delete()
                    .eq('id', targetId)
                    .eq('user_id', user.id);
                if (error) throw error;
            }
        }

        // 4. Cleanup Store
        await supabase.from('agent_options').delete().eq('id', option_id);

        return NextResponse.json({
            status: 'applied',
            summary: patch.summary
        });

    } catch (error) {
        console.error('Apply API Error:', error);
        return NextResponse.json({ error: 'Failed to apply changes' }, { status: 500 });
    }
}
