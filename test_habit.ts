import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { executeAI } from './src/lib/ai/ai-service';

async function main() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const userId = "90c87c57-e940-4d27-9866-9f04fac4d2ca";

    const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single();
    const { data: goals } = await supabase.from('goals').select('*').eq('user_id', userId).eq('status', 'active');
    
    const aiContext = {
        mode: 'build',
        profile: {
            name: profile?.full_name || 'User',
            sleep_start: profile?.sleep_start,
            sleep_end: profile?.sleep_end,
            ai_profile: (profile as any)?.bio_data?.ai_profile || null
        },
        goals: goals?.map((g: any) => ({ title: g.title, category: g.category, importance: g.importance })) || [],
        existing_stacks: []
    };

    console.log("Calling executeAI for habit_stack...");
    try {
        const result = await executeAI(userId, {
            channel: 'habit_stack',
            input: "Build new habit stack based on my goals",
            context: aiContext
        });
        console.log(JSON.stringify(result, null, 2));
    } catch (e: any) {
        console.error("Error:", e);
    }
}

main();
