import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: cfaCmt } = await supabase.from('commitments').select('user_id').eq('title', 'CFA Block 1').limit(1);
    const userId = cfaCmt[0].user_id;

    // We can't easily mock Next.js Request with Auth, so let's just copy the exact logic of getSummary for this user
    const startDate = new Date('2026-06-08T00:00:00Z');
    const endDate = new Date('2026-06-15T00:00:00Z');

    const [commitmentsRes, blocksRes] = await Promise.all([
        supabase.from('commitments').select('*').eq('user_id', userId).eq('is_active', true),
        supabase.from('schedule_blocks').select('*').eq('user_id', userId)
            .gte('date', '2026-06-08').lt('date', '2026-06-15')
    ]);

    const rawCommitments = commitmentsRes.data || [];
    const blocks = (blocksRes.data || []).filter((b: any) => b.block_type !== 'anchor');

    console.log("Real blocks on Sunday:", blocks.filter((b: any) => b.date === '2026-06-14').map((b:any) => b.title));

    const existingCmtKeys = new Set(
        blocks.filter((b: any) => b.commitment_id).map((b: any) => `${b.commitment_id}-${b.date}`)
    );

    const virtualBlocks: any[] = [];
    for (let i = 0; i < 7; i++) {
        // Here we simulate exactly what date-fns addDays does to a Date object created with new Date(str)
        // Wait, startOfDay(new Date()) is what API uses. 
        // If frontend passes startParam = '2026-06-08', parseISO returns Date obj.
        const currentDate = new Date(startDate);
        currentDate.setDate(currentDate.getDate() + i);
        
        // format(currentDate, 'yyyy-MM-dd')
        const y = currentDate.getFullYear();
        const m = String(currentDate.getMonth() + 1).padStart(2, '0');
        const d = String(currentDate.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;

        const dayOfWeek = currentDate.getDay(); 

        rawCommitments.forEach((cmt: any) => {
            if (cmt.title !== 'CFA Block 1') return;
            if (!Array.isArray(cmt.days_of_week) || cmt.days_of_week.length === 0) return;
            if (!cmt.days_of_week.includes(dayOfWeek)) return;

            const key = `${cmt.id}-${dateStr}`;
            if (existingCmtKeys.has(key)) return;

            virtualBlocks.push({ id: `virt-cmt-${cmt.id}-${dateStr}`, date: dateStr, title: cmt.title });
        });
    }

    console.log("Virtual blocks generated for CFA Block 1:");
    console.log(virtualBlocks);
}
main();
