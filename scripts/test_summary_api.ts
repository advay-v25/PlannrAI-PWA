import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
    const { data: profiles } = await supabase.from('profiles').select('id').limit(1);
    const userId = profiles[0].id;
    
    // fetch commitments and blocks just like the API
    const startStr = '2026-06-08';
    const endStr = '2026-06-15';
    
    const [commitmentsRes, blocksRes] = await Promise.all([
        supabase.from('commitments').select('*').eq('user_id', userId).eq('is_active', true),
        supabase.from('schedule_blocks').select('*').eq('user_id', userId).gte('date', startStr).lt('date', endStr).neq('status', 'inbox')
    ]);
    
    const rawCommitments = commitmentsRes.data || [];
    const blocks = (blocksRes.data || []).filter(b => b.block_type !== 'anchor');
    
    const seenCmtKeys = new Set<string>();
    const commitments = rawCommitments.filter((cmt: any) => {
        const key = `${cmt.title}|${cmt.start_time}|${cmt.end_time}|${JSON.stringify(cmt.days_of_week || [])}`;
        if (seenCmtKeys.has(key)) return false;
        seenCmtKeys.add(key);
        return true;
    });
    
    const existingCmtKeys = new Set(
        blocks.filter((b: any) => b.commitment_id).map((b: any) => `${b.commitment_id}-${b.date}`)
    );
    
    const virtualBlocks = [];
    const startDate = new Date('2026-06-08T00:00:00.000Z');
    
    for (let i = 0; i < 7; i++) {
        const currentDate = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
        const dateStr = currentDate.toISOString().split('T')[0];
        const dayOfWeek = currentDate.getDay(); // 0 is Sunday
        
        commitments.forEach((cmt: any) => {
            if (!Array.isArray(cmt.days_of_week) || cmt.days_of_week.length === 0) return;
            if (!cmt.days_of_week.includes(dayOfWeek)) return;
            
            const key = `${cmt.id}-${dateStr}`;
            if (existingCmtKeys.has(key)) return;
            
            virtualBlocks.push({
                id: `virt-cmt-${cmt.id}-${dateStr}`,
                title: cmt.title,
                date: dateStr,
                start_time: cmt.start_time,
                end_time: cmt.end_time,
                dayOfWeek
            });
        });
    }
    
    console.log("Virtual Blocks on Sunday (2026-06-14):");
    console.log(virtualBlocks.filter(b => b.date === '2026-06-14'));
    
    console.log("Real Blocks on Sunday (2026-06-14):");
    console.log(blocks.filter(b => b.date === '2026-06-14').map(b => ({ id: b.id, title: b.title, commitment_id: b.commitment_id })));
}
main();
