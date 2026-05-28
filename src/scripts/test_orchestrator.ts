import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { WeekOrchestrator } from '../lib/calendar/week-orchestrator';

// Supabase Setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const { data: users } = await supabase.from('profiles').select('id, email').limit(5);
    const userId = users?.find(u => u.email === 'advayvaidya.25@gmail.com')?.id || users?.[0]?.id;
    
    if (!userId) {
        console.error("User not found");
        return;
    }
    
    console.log(`Testing orchestrator for user: ${userId}`);
    
    const now = new Date();
    // Monday
    const monday = new Date(now.getTime() - ((now.getDay() || 7) - 1) * 24 * 60 * 60 * 1000);
    const weekStartStr = monday.toISOString().split('T')[0];
    
    try {
        const result = await WeekOrchestrator.generateWeek({
            userId,
            weekStartISO: weekStartStr,
            mode: 'plan',
            supabase
        });
        
        console.log(`Generated ${result.previewBlocks.length} preview blocks`);
        console.log(`Created ${result.patch.changes.filter(c => c.op === 'create_event').length} goal blocks in patch`);
        
        if (result.patch.changes.length === 0) {
            console.log("No changes generated! Let's check summary:");
            console.log(JSON.stringify(result.summary, null, 2));
        }
    } catch (err: any) {
        console.error("Error running orchestrator:", err);
    }
}

main().catch(console.error);
