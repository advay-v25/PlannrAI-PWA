import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { SchedulerAgent } from '../src/lib/agents/scheduler/scheduler-agent';
import { AgentContext } from '../src/lib/agents/core/types';
import { v4 as uuidv4 } from 'uuid';

dotenv.config({ path: '.env.local' });

async function verifyPillar2() {
    console.log("🗓️  Verifying Pillar 2: Calendar Authority (Block Types)...");

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // Bypass RLS

    if (!supabaseKey) {
        console.error("❌ SERVICE_ROLE_KEY missing.");
        process.exit(1);
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false }
    });

    // 1. Get User
    const { data: user } = await supabase.from('profiles').select('id').limit(1).single();
    if (!user) {
        console.error("❌ No user found.");
        return;
    }
    const userId = user.id;
    console.log(`   Using User: ${userId}`);

    // 2. Run Scheduler Agent (Mock Input)
    const scheduler = new SchedulerAgent();
    // Mock Context
    const context: AgentContext = {
        userId,
        now: new Date(),
        timezone: 'UTC',
        currentSchedule: []
    };

    // Mock Planner Input (Add Constraint)
    const input = {
        planner: {
            intent: 'add_constraint' as const,
            time_refs: [{ start: new Date().toISOString(), duration_minutes: 60 }],
            entities: { new_task_text: "Verification Meeting" },
            scope: 'block' as const,
            urgency: 'high' as const,
            requires_calendar_change: true,
            strategy: 'move' as const
        },
        regulator: {
            response_mode: 'minimal' as const,
            max_options: 2,
            language_style: 'direct' as const,
            ask_questions: false,
            warn_user: false
        }
    };

    // Run Agent
    const result = await scheduler.run(input, context);
    const option = result.options[0];

    if (!option) {
        console.error("❌ Scheduler returned no options.");
        return;
    }

    // 3. Verify Output Structure has block_type
    const patchData = option.patch.changes[0].data;
    console.log("   Generated Patch Data:", patchData);

    if (patchData.block_type === 'anchor') {
        console.log("✅ PASS: Scheduler generated 'anchor' type.");
    } else {
        console.error(`❌ FAIL: Expected 'anchor', got '${patchData.block_type}'`);
    }

    // 4. Verify DB Insert (Simulate Apply)
    // Schema expects `date`, `start_time` (TIME), `end_time` (TIME)
    const isoStart = patchData.start_time;
    const isoEnd = patchData.end_time;

    // Extract HH:mm:ss
    const startTime = isoStart.split('T')[1].split('.')[0];
    const endTime = isoEnd.split('T')[1].split('.')[0];
    const date = isoStart.split('T')[0];

    // We manually insert this patch to verify DB accepts it
    const { error } = await supabase.from('schedule_blocks').insert({
        ...patchData,
        start_time: startTime,
        end_time: endTime,
        user_id: userId,
        date: date
    });

    if (error) {
        console.error("❌ DB Insert Failed:", error);
    } else {
        console.log("✅ PASS: Database accepted 'anchor' block.");
    }

    // Cleanup
    await supabase.from('schedule_blocks').delete().eq('id', patchData.id);
}

verifyPillar2();
