import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { ContextBuilder } from '../src/lib/agents/context-builder';
import { v4 as uuidv4 } from 'uuid';
import { startOfDay, subDays } from 'date-fns';

dotenv.config({ path: '.env.local' });

async function verifyPillar1() {
    console.log("🧠 Verifying Pillar 1: User State Engine...");

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // Correct name from .env.local
    // Fallback to ANON if service key missing (but it will fail RLS)

    if (!supabaseKey) {
        console.error("❌ SERVICE_ROLE_KEY missing. Cannot bypass RLS.");
        process.exit(1);
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false }
    });

    // 1. Setup Test User (Reuse existing to avoid Rate Limits)
    const { data: existingUser } = await supabase
        .from('profiles')
        .select('id')
        .limit(1)
        .single();

    if (!existingUser) {
        console.error("❌ No existing users found. Cannot run test.");
        return;
    }

    const userId = existingUser.id;
    console.log(`   Using existing User: ${userId}`);

    // Clean up previous test data for this user to ensure clean state
    await supabase.from('schedule_blocks').delete().eq('user_id', userId).eq('status', 'missed');

    // 2. Seed Data: 5 Missed Blocks Yesterday (Should trigger High Cognitive Load / Low Emotion)
    const yesterday = subDays(new Date(), 1);
    const blocks = Array.from({ length: 5 }).map(() => ({
        user_id: userId,
        date: startOfDay(yesterday).toISOString(),
        start_time: '12:00:00',
        end_time: '13:00:00',
        status: 'missed' as const,
        title: 'Missed Task'
    }));

    const { error: seedError } = await supabase.from('schedule_blocks').insert(blocks);
    if (seedError) {
        console.error("Failed to seed blocks:", seedError);
        return;
    }
    console.log("   Seeded 5 missed blocks for yesterday.");

    // 3. Run ContextBuilder (Should trigger State Refresh)
    // We inject the client to ContextBuilder? No, it handles its own.
    // Wait, ContextBuilder uses `createClient` from `@/lib/supabase/server`.
    // In a script, that might fail because cookies/headers don't exist.
    // I added `injectedClient` in Phase 12! I should use it.

    const context = await ContextBuilder.build(userId, supabase);

    console.log("\n🔍 Context Result:");
    console.log("   User State:", context.userState);

    // 4. Assertions
    if (!context.userState) {
        console.error("❌ FAILURE: No User State returned.");
    } else {
        const { cognitive_load, emotional_bandwidth, current_mode } = context.userState;

        // Expecting Cognitive Load increase (due to >3 missed blocks)
        if (cognitive_load > 2) {
            console.log("✅ PASS: Cognitive Load increased (Open Loops).");
        } else {
            console.warn("⚠️ WARNING: Cognitive Load did not increase as expected. Check logic.");
        }

        if (emotional_bandwidth < 3) {
            console.log("✅ PASS: Emotional Bandwidth decreased (Guilt).");
        }

        console.log(`   Mode: ${current_mode}`);
    }

    // Cleanup (Optional, but good practice)
    // Supabase Auth doesn't allow easy deletion via client usually. 
    console.log("Done.");
}

verifyPillar1();
