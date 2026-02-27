// @ts-nocheck
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { EmergencyService } from '../src/lib/services/emergency-service';
import { ConflictService } from '../src/lib/scheduling/conflict-service';
import { format, addHours, startOfDay, addMinutes, parseISO } from 'date-fns';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function runVerification() {
    console.log("⚖️  VERIFYING CALENDAR LAW...");
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // 1. Get User
    const { data: user } = await supabase.from('profiles').select('id').limit(1).single();
    if (!user) throw new Error("No user found");
    const userId = user.id;

    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');

    // 2. Setup: Clear Day & Create Anchor
    console.log("🧹 Cleaning slate...");
    await supabase.from('schedule_blocks').delete().eq('user_id', userId).eq('date', todayStr);

    console.log("⚓ Creating Immutable Anchor (Sleep)...");
    const { data: anchor, error } = await supabase.from('schedule_blocks').insert({
        user_id: userId,
        date: todayStr,
        title: "Deep Sleep",
        start_time: "23:00:00",
        end_time: "23:59:00",
        block_type: "anchor",
        is_fixed: true
    }).select().single();

    if (error || !anchor) {
        console.error("❌ Failed to create anchor:", error);
        return;
    }

    if (!anchor) {
        console.error("❌ Failed to create anchor. DB returned null. Check RLS or Constraint.");
        // We can't proceed without an anchor
        return;
    }

    // 3. Test Conflict Judgment (Overlap with Anchor)
    // 3. Test Conflict Judgment (Overlap with Anchor)
    console.log("⚔️  Testing Conflict Service (Anchor Overlap)...");
    console.log(`   Anchor Data: Start=${anchor.start_time} End=${anchor.end_time}`); // DEBUG

    const conflictResult = ConflictService.judgeChange(
        [anchor],
        {
            start: parseISO(`${todayStr}T23:30:00`),
            end: parseISO(`${todayStr}T23:45:00`),
            type: 'flexible'
        }
    );

    if (conflictResult.status === 'rejected') {
        console.log("✅ SUCCESS: ConflictService rejected overlap with Anchor.");
    } else {
        console.error("❌ FAILURE: ConflictService allowed Anchor overlap!", conflictResult);
    }

    // 4. Test Emergency Mode
    console.log("🚨 Testing Emergency Service...");
    // Fill day with junk
    await supabase.from('schedule_blocks').insert([
        { user_id: userId, date: todayStr, title: "Stress 1", start_time: "09:00", end_time: "12:00", block_type: "work" },
        { user_id: userId, date: todayStr, title: "Stress 2", start_time: "12:00", end_time: "15:00", block_type: "work" },
        { user_id: userId, date: todayStr, title: "Stress 3", start_time: "15:00", end_time: "18:00", block_type: "work" },
        { user_id: userId, date: todayStr, title: "Stress 4", start_time: "18:00", end_time: "21:00", block_type: "work" }
    ]);

    const check = await EmergencyService.checkOverwhelm(userId, today, supabase);
    console.log(`   Work Minutes: ${check.workMinutes} (Overwhelmed: ${check.isOverwhelmed})`);

    if (check.isOverwhelmed) {
        const patch = await EmergencyService.generateEmergencyPatch(userId, today, supabase);
        console.log(`   Generated Patch Summary: ${patch?.summary}`);
        console.log(`   Items to Hide: ${patch?.changes.length}`);

        if (patch && patch.changes.length >= 3) { // Should hide most
            console.log("✅ SUCCESS: Emergency Patch generated correctly.");
        } else {
            console.error("❌ FAILURE: Emergency Patch unexpected.", patch);
        }
    } else {
        console.warn("⚠️  Did not trigger overwhelm threshhold.");
    }

    // Cleanup
    await supabase.from('schedule_blocks').delete().eq('user_id', userId).eq('date', todayStr);
}

runVerification().catch(console.error);
