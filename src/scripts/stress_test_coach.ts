import { createClient } from '@supabase/supabase-js';
import { PatchService } from '../lib/services/patch-service';

// Copy of validateCoachOps logic from apply/route.ts for testing
async function validateCoachOps(patch: any, userId: string, supabase: any): Promise<string[]> {
    if (!patch.ops || !Array.isArray(patch.ops)) return [];

    const errors: string[] = [];
    const targetSlots: Array<{ op: string; date: string; start: string; end: string; title: string; blockId?: string }> = [];

    const moveBlockIds: string[] = [];
    for (const op of patch.ops) {
        if ((op.op === 'move_event' || op.op === 'move') && op.event_id && !op.date) {
            moveBlockIds.push(op.event_id);
        }
    }

    let blockDateMap: Record<string, string> = {};
    if (moveBlockIds.length > 0) {
        const { data: blocks } = await supabase
            .from('schedule_blocks')
            .select('id, date')
            .eq('user_id', userId)
            .in('id', moveBlockIds);
        if (blocks) {
            blockDateMap = blocks.reduce((acc: Record<string, string>, b: any) => ({ ...acc, [b.id]: b.date }), {});
        }
    }

    for (const op of patch.ops) {
        if (op.op === 'move_event' || op.op === 'move') {
            const date = op.date || op.new_date || (op.event_id && blockDateMap[op.event_id]);
            const start = op.to_start || op.new_start;
            const end = op.to_end || op.new_end;
            if (date && start && end) {
                targetSlots.push({ op: 'move', date, start, end, title: op.title || '', blockId: op.event_id });
            }
        }
        if (op.op === 'create_event' || op.op === 'create') {
            const p = op.payload || {};
            if (p.date && p.start_time && p.end_time) {
                targetSlots.push({ op: 'create', date: p.date, start: p.start_time, end: p.end_time, title: p.title || '' });
            }
        }
    }

    if (targetSlots.length === 0) return [];
    const dates = [...new Set(targetSlots.map(s => s.date))];

    const { data: existingBlocks } = await supabase
        .from('schedule_blocks')
        .select('id, title, context, block_type, goal_id, date, start_time, end_time')
        .eq('user_id', userId)
        .in('date', dates);

    if (!existingBlocks) return [];

    const overlaps = (s1: string, e1: string, s2: string, e2: string): boolean => {
        const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
        const a1 = toMin(s1), a2 = toMin(e1), b1 = toMin(s2), b2 = toMin(e2);
        return a1 < b2 && b1 < a2;
    };

    const deletedIds = new Set(
        patch.ops
            .filter((o: any) => o.op === 'delete_event' || o.op === 'delete')
            .map((o: any) => o.event_id)
            .filter(Boolean)
    );

    // Simulate post-patch state for moved blocks
    for (const b of existingBlocks) {
        const moveOp = patch.ops.find((o: any) => (o.op === 'move_event' || o.op === 'move') && o.event_id === b.id);
        if (moveOp) {
            if (moveOp.date || moveOp.new_date) b.date = moveOp.date || moveOp.new_date;
            if (moveOp.to_start || moveOp.new_start) b.start_time = moveOp.to_start || moveOp.new_start;
            if (moveOp.to_end || moveOp.new_end) b.end_time = moveOp.to_end || moveOp.new_end;
        }
    }

    const IMMUTABLE_TYPES = ['anchor', 'locked'];
    const hasReplan = patch.ops.some((o: any) => o.op === 'replan_day' || o.op === 'replan_week');

    for (const slot of targetSlots) {
        const dayBlocks = existingBlocks.filter((b: any) => b.date === slot.date);
        for (const block of dayBlocks) {
            if (slot.blockId && block.id === slot.blockId) continue;
            if (deletedIds.has(block.id)) continue;
            
            if (hasReplan && !IMMUTABLE_TYPES.includes(block.block_type)) continue;

            if (overlaps(slot.start, slot.end, block.start_time, block.end_time)) {
                errors.push(`Cannot ${slot.op} "${slot.title}" at ${slot.start}-${slot.end} — overlaps with existing ${block.block_type} block "${block.title}" (${block.start_time}-${block.end_time})`);
            }
        }
    }

    return errors;
}

async function main() {
    console.log("🚀 Starting Deep Audit Stress Test...");
    
    // Parse dotenv safely since we are running via tsx
    require('dotenv').config({ path: '.env.local' });
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; 
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: users } = await supabase.from('profiles').select('id').limit(1);
    if (!users || users.length === 0) throw new Error("No users found in profiles table");
    const userId = users[0].id;
    console.log(`👤 Using test user: ${userId}`);
    const testDate = new Date().toISOString().split('T')[0];

    // Setup: clear any existing blocks for today for clean testing
    await supabase.from('schedule_blocks').delete().eq('user_id', userId).eq('date', testDate);

    // --- Scenario 1: Overlap Prevention (Base) ---
    console.log("\n🧪 Scenario 1: Overlap Prevention");
    
    const block1Id = "11111111-1111-1111-1111-111111111111";
    await supabase.from('schedule_blocks').insert({
        id: block1Id,
        user_id: userId,
        title: 'Important Meeting',
        date: testDate,
        start_time: '14:00',
        end_time: '15:00',
        block_type: 'anchor'
    });

    const maliciousPatch1 = {
        ops: [{
            op: 'create_event',
            payload: { title: 'AI Overlapping Task', date: testDate, start_time: '14:30', end_time: '15:30', block_type: 'flex' }
        }]
    };
    
    const errors1 = await validateCoachOps(maliciousPatch1, userId, supabase);
    if (errors1.length > 0) {
        console.log("✅ Passed! Overlap correctly rejected by server validation:");
        console.log("   ->", errors1[0]);
    } else {
        console.error("❌ Failed! Overlap was NOT rejected.");
    }

    // --- Scenario 2: Overlap Prevention (Cascading Move bypass) ---
    console.log("\n🧪 Scenario 2: Valid Cascading Move (Swap/Move)");
    
    // If the AI issues a move for the existing block AND creates a new one, it should pass!
    const validPatch2 = {
        ops: [
            {
                op: 'move_event',
                event_id: block1Id,
                to_start: '15:00',
                to_end: '16:00',
                date: testDate,
                title: 'Important Meeting' // AI usually includes title
            },
            {
                op: 'create_event',
                payload: { title: 'AI Overlapping Task', date: testDate, start_time: '14:30', end_time: '15:00', block_type: 'flex' }
            }
        ]
    };
    
    const errors2 = await validateCoachOps(validPatch2, userId, supabase);
    if (errors2.length === 0) {
        console.log("✅ Passed! Server correctly accepts cascading moves (no final overlap).");
    } else {
        console.error("❌ Failed! Server falsely flagged a cascade move as an overlap.", errors2);
    }

    // --- Scenario 3: Goal Daily Limit Validation ---
    console.log("\n🧪 Scenario 3: Universal Goal Enforcement (Daily)");
    
    const { data: goals } = await supabase.from('goals').select('id, minutes_per_day').eq('user_id', userId).limit(1);
    if (goals && goals.length > 0) {
        const goal = goals[0];
        console.log(`   Found Goal: ${goal.minutes_per_day} min/day limit`);
        
        // Try creating 10 hours of it
        const maliciousPatch3 = {
            ops: [{
                op: 'create_event',
                payload: { title: 'Grind', date: testDate, start_time: '08:00', end_time: '18:00', block_type: 'goal', goal_id: goal.id }
            }]
        };
        
        const result = await PatchService.applyPatch(userId, maliciousPatch3 as any, supabase, 'coach');
        if (result.success) {
            console.error("❌ Failed! PatchService allowed a 10 hour block creation for a limited goal.");
        } else {
            console.log("✅ Passed! PatchService correctly blocked creation over-allocation.");
            console.log("   ->", result.errors);
        }
    } else {
        console.log("   Skipped (No goals found)");
    }
    
    // --- Scenario 4: Multi-block Cascade ---
    console.log("\n🧪 Scenario 4: Multi-block Cascading Move (Friend Outing)");
    
    // Setup: Create two blocks that are going to be cascaded
    const blockAId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const blockBId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    
    await supabase.from('schedule_blocks').insert([
        { id: blockAId, user_id: userId, title: 'Morning Work', date: testDate, start_time: '09:00', end_time: '10:00', block_type: 'flex' },
        { id: blockBId, user_id: userId, title: 'Late Morning Work', date: testDate, start_time: '10:30', end_time: '11:30', block_type: 'flex' }
    ]);

    // AI proposes to create a 3 hour block from 08:30 to 11:30, and moves block A to 12:00-13:00 and block B to 13:00-14:00
    const validPatch4 = {
        ops: [
            { op: 'move_event', event_id: blockAId, to_start: '12:00', to_end: '13:00', date: testDate, title: 'Morning Work' },
            { op: 'move_event', event_id: blockBId, to_start: '13:00', to_end: '14:00', date: testDate, title: 'Late Morning Work' },
            { op: 'create_event', payload: { title: 'Friend Outing', date: testDate, start_time: '08:30', end_time: '11:30', block_type: 'flex' } }
        ]
    };

    // --- Scenario 5: Auto-Cascade via Replan Day ---
    console.log("\n🧪 Scenario 5: Auto-Cascade via is_locked + replan_day (Friend Outing)");
    
    // AI proposes to create a locked block and replan the day
    const validPatch5 = {
        ops: [
            { op: 'create_event', payload: { title: 'Friend Outing', date: testDate, start_time: '08:30', end_time: '11:30', block_type: 'flex', is_locked: true } },
            { op: 'replan_day', payload: { mode: 'balanced' } }
        ]
    };

    // We expect this to pass validation because the replan_day op handles overlaps
    // Wait, validateCoachOps throws overlap errors if we do this unless we teach validateCoachOps to ignore overlaps if there is a replan_day!
    // Let's check validateCoachOps behavior.

    const errors5 = await validateCoachOps(validPatch5, userId, supabase);
    if (errors5.length === 0) {
        console.log("✅ Passed! Auto-cascade payload validated successfully.");
    } else {
        console.error("❌ Failed! Auto-cascade payload flagged an error.", errors5);
    }

    console.log("\n🏁 Stress Test Complete.");
}

main().catch(console.error);
