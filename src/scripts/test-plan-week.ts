import { createClient } from '@supabase/supabase-js';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { generateWeekPlan } from '../lib/calendar/ai/plan-week';
import { buildCalendarContext } from '../lib/calendar/context-builder';
import { format, startOfWeek } from 'date-fns';

dotenv.config({ path: path.join(__dirname, '../../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // override with service role

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log("Fetching test user...");
    const { data: users, error: userErr } = await supabase.from('profiles').select('id').limit(1);
    if (userErr || !users.length) {
        throw new Error("No user found");
    }
    const userId = users[0].id;
    console.log(`Using user: ${userId}`);

    console.log("Building Calendar Context...");
    const ctx = await buildCalendarContext(userId, supabase as any);

    const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    console.log(`Generating Plan for Week Starting: ${weekStart}`);

    const variants = await generateWeekPlan(ctx, weekStart, 'balanced');

    console.log(`Generated ${variants.length} variants.`);
    if (variants.length > 0) {
        const first = variants[0];
        console.log(`✅ Variant 1 (${first.label}): ${first.blocks.length} blocks generated.`);
        if (first.blocks.length > 0) {
            console.log("Sample block:");
            console.dir(first.blocks[0], { depth: null });
        }
    } else {
        console.log("❌ No variants generated.");
    }
}

main().catch(console.error);
