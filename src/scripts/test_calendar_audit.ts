import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { buildCalendarContext } from '../lib/calendar/context-builder';
import { generateWeekPlan } from '../lib/calendar/ai/plan-week';
import { optimizeDayAI } from '../lib/calendar/ai/optimize-day';
import { PatchService } from '../lib/services/patch-service';

async function main() {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const userId = '70d394bd-d04e-46c0-9c55-3cafa70c5ca0'; // Advay's test profile
    
    console.log("=== STARTING CALENDAR AUDIT ===");
    
    try {
        console.log("\n[1] Testing Context Builder...");
        const calendarCtx = await buildCalendarContext(userId, supabase);
        console.log(`Context Built. Schedule Blocks: ${calendarCtx.schedule.this_week.length}`);

        console.log("\n[2] Testing Plan Week Generation (Balanced Mode)...");
        const variants = await generateWeekPlan(calendarCtx, '2026-05-25', 'balanced', true, {
            bufferMinutes: 15,
            maxGoalBlocksPerDay: 4,
            maxDeepWorkMins: 240,
        });
        console.log(`Generated ${variants.length} plan options. Variant 1 has ${variants[0]?.blocks.length} blocks.`);

        console.log("\n[3] Testing Optimize Day AI Generation...");
        const result = await optimizeDayAI(calendarCtx, undefined);
        console.log(`Optimize Day generated: ${result.options.length} options. Analysis: ${result.analysis}`);
        
        console.log("\n[4] Testing PatchService dry run (Fake AI ops)...");
        const dummyPatch = {
            ops: [
                {
                    op: 'create_event',
                    payload: {
                        title: 'Audit Dummy Block',
                        date: '2026-05-25',
                        start_time: '14:00',
                        end_time: '15:00',
                        block_type: 'flex'
                    }
                }
            ]
        };
        const patchResult = await PatchService.applyPatch(userId, dummyPatch as any, supabase, 'test');
        console.log(`Patch applied: ${patchResult.success}. Undo token: ${patchResult.undo_token}`);
        
        if (patchResult.success && patchResult.undo_token) {
            console.log("Undoing dummy patch...");
            const undoResult = await PatchService.undoPatch(userId, patchResult.undo_token, supabase);
            console.log(`Undo result: ${undoResult.success}, changes: ${undoResult.changes}`);
        }

    } catch(err) {
        console.error("AUDIT FAILED:", err);
    }
}
main().catch(console.error);
