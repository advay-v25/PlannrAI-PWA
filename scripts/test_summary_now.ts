import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

async function run() {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    
    // Get advay's user id
    const { data: users } = await supabase.from('profiles').select('id, first_name');
    const user = users.find(u => u.first_name === 'Advay');
    if (!user) return console.log("User not found");

    // Fetch summary logic manually to see EXACTLY what happens to CFA Block 1 on Sunday 2026-06-14
    const startStr = '2026-06-08';
    const endStr = '2026-06-15';

    const [commitmentsRes, blocksRes] = await Promise.all([
        supabase.from('commitments').select('*').eq('user_id', user.id).eq('is_active', true),
        supabase.from('schedule_blocks').select('*').eq('user_id', user.id).gte('date', startStr).lt('date', endStr).neq('status', 'inbox')
    ]);

    const rawCommitments = commitmentsRes.data || [];
    const blocksResData = blocksRes.data || [];

    const blocks = blocksResData.filter((b: any) => b.block_type !== 'anchor');

    const seenCmtKeys = new Set<string>();
    const commitments = rawCommitments.filter((cmt: any) => {
        const key = `${cmt.title}|${cmt.start_time}|${cmt.end_time}|${JSON.stringify(cmt.days_of_week || [])}`;
        if (seenCmtKeys.has(key)) return false;
        seenCmtKeys.add(key);
        return true;
    });

    const existingCmtKeys = new Set(
        blocks
            .filter((b: any) => b.commitment_id)
            .map((b: any) => `${b.commitment_id}-${b.date}`)
    );

    console.log("commitments:", commitments.map(c => ({ title: c.title, days: c.days_of_week })));
    console.log("existingCmtKeys:", existingCmtKeys);

    // Let's check Sunday 2026-06-14
    const dateStr = '2026-06-14';
    const dayOfWeek = 0; // Sunday

    commitments.forEach((cmt: any) => {
        if (!Array.isArray(cmt.days_of_week) || cmt.days_of_week.length === 0) return;
        if (!cmt.days_of_week.includes(dayOfWeek)) return;

        const key = `${cmt.id}-${dateStr}`;
        if (existingCmtKeys.has(key)) {
            console.log(`SKIPPED ${cmt.title} on Sunday: existing key ${key}`);
            return;
        }

        console.log(`GENERATED ${cmt.title} for Sunday!`);
    });
}
run();
