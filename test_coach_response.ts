import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { generateCoachResponse } from './src/lib/coach/response-generator';
import { buildCoachContext } from './src/lib/coach/context-builder';
import { classifyIntent } from './src/lib/coach/intent-classifier';

dotenv.config({ path: '.env.local' });

async function run() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Advay's user ID is usually the one with email plannrai@... or we can just fetch the first user
    const { data: users } = await supabase.from('profiles').select('*').limit(1);
    if (!users || users.length === 0) {
        console.log("No users found");
        return;
    }
    const userId = users[0].id;

    console.log("Building context for user:", userId);
    const context = await buildCoachContext(userId, supabase);

    const message = "I wont be able to do the 7:15 block";
    
    // Fake intent classification to force MOVE_BLOCK and missed block
    const intentClassification = await classifyIntent(message, [], context as any);
    
    // Add fake pre_resolved_block to simulate route.ts behavior
    const fakePreResolved = {
        id: "fake-id-123",
        title: "Build PlannrAI (Part)",
        date: context.current.date,
        start_time: "19:15",
        end_time: "20:00",
        status: "planned",
        block_type: "goal"
    };
    (context as any).pre_resolved_block = fakePreResolved;

    console.log("Calling generateCoachResponse...");
    const response = await generateCoachResponse(
        message,
        [],
        context,
        supabase,
        null,
        intentClassification
    );

    console.log("--- FINAL RESPONSE ---");
    console.log(JSON.stringify(response, null, 2));
}

run().catch(console.error);
