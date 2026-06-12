import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
    const { data: cfaCmt } = await supabase.from('commitments').select('user_id').eq('title', 'CFA Block 1').limit(1);
    if (!cfaCmt || cfaCmt.length === 0) { console.log("No user with CFA Block 1"); return; }
    const userId = cfaCmt[0].user_id;
    console.log("UserID:", userId);
    
    const { data: commitmentsRes } = await supabase.from('commitments').select('*').eq('user_id', userId).eq('is_active', true);
    console.log("Found commitments:", commitmentsRes?.length);
    
    const rawCommitments = commitmentsRes || [];
    const seenCmtKeys = new Set<string>();
    const commitments = rawCommitments.filter((cmt: any) => {
        const key = `${cmt.title}|${cmt.start_time}|${cmt.end_time}|${JSON.stringify(cmt.days_of_week || [])}`;
        if (seenCmtKeys.has(key)) return false;
        seenCmtKeys.add(key);
        return true;
    });
    
    console.log("After deduplication:", commitments.length);
    
    // Simulate what summary API does to blocks
    const startStr = '2026-06-08';
    const endStr = '2026-06-15';
    const { data: blocksRes } = await supabase.from('schedule_blocks')
                .select('*')
                .eq('user_id', userId)
                .gte('date', startStr)
                .lt('date', endStr)
                .neq('status', 'inbox');
                
    const blocks = (blocksRes || []).filter(b => b.block_type !== 'anchor');
    const existingCmtKeys = new Set(
        blocks.filter((b: any) => b.commitment_id).map((b: any) => `${b.commitment_id}-${b.date}`)
    );
    console.log("Existing CMT keys for this week:", existingCmtKeys);
    
    const startDate = new Date('2026-06-08T00:00:00.000Z');
    
    for (let i = 0; i < 7; i++) {
        const currentDate = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
        const dateStr = currentDate.toISOString().split('T')[0];
        const dayOfWeek = currentDate.getDay(); 
        
        if (dayOfWeek === 0) { // Sunday
            console.log("\nSUNDAY", dateStr);
            commitments.forEach((cmt: any) => {
                if (!cmt.title.includes('CFA')) return;
                console.log(`Checking ${cmt.title}`);
                if (!cmt.days_of_week.includes(dayOfWeek)) {
                    console.log(`  -> DOES NOT INCLUDE 0! Array is:`, cmt.days_of_week);
                } else {
                    console.log(`  -> INCLUDES 0!`);
                    const key = `${cmt.id}-${dateStr}`;
                    if (existingCmtKeys.has(key)) {
                        console.log(`  -> SKIPPED! Block already exists in DB!`);
                    } else {
                        console.log(`  -> SUCCESS! Virtual block created!`);
                    }
                }
            });
        }
    }
}
main();
