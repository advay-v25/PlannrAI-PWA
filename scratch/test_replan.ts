import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { PatchService } from '../src/lib/services/patch-service';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // Bypass RLS using service role key
const supabase = createClient(supabaseUrl, supabaseKey);

async function testReplan() {
    const userId = '8bb069d3-744f-4d4e-a2ea-8866fb981a70';
    console.log("Simulating replan_day patch for user...", userId);

    const patch = {
        ops: [
            {
                op: 'replan_day',
                payload: {
                    mode: 'balanced'
                }
            }
        ],
        undoable: true,
        reason: 'Test replan_day',
        scope: 'day'
    };

    try {
        const result = await PatchService.applyPatch(userId, patch as any, supabase, 'coach');
        console.log("Result:", JSON.stringify(result, null, 2));
    } catch (e: any) {
        console.error("Exception thrown:", e.message);
        if (e.stack) {
            console.error(e.stack);
        }
    }
}

testReplan();
