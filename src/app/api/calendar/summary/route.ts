
import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { startOfDay, addDays, format, parseISO } from 'date-fns';

export const GET = secureApiRoute(
    async (context) => {
        const { searchParams } = new URL(context.request.url);
        const startParam = searchParams.get('start');
        const daysParam = searchParams.get('days');

        const startDate = startParam ? parseISO(startParam) : startOfDay(new Date());
        const days = daysParam ? parseInt(daysParam, 10) : 7;
        const endDate = addDays(startDate, days);

        const startStr = format(startDate, 'yyyy-MM-dd');
        const endStr = format(endDate, 'yyyy-MM-dd');

        const supabase = await createClient();

        // Parallel Fetch: Profile (not profile_preferences), Commitments, Goals, Habits, Blocks
        const [profileRes, commitmentsRes, goalsRes, habitsRes, blocksRes, inboxBlocks] = await Promise.all([
            supabase.from('profiles').select('*').eq('id', context.userId).single(),
            supabase.from('commitments').select('*').eq('user_id', context.userId).eq('is_active', true),
            supabase.from('goals').select('*').eq('user_id', context.userId).eq('is_paused', false),
            supabase.from('habit_stacks').select('*').eq('user_id', context.userId).eq('enabled', true),
            supabase.from('schedule_blocks')
                .select('*, goal:goals(*)')
                .eq('user_id', context.userId)
                .gte('date', startStr)
                .lt('date', endStr)
                .neq('status', 'inbox'),
            supabase.from('schedule_blocks').select('*').eq('user_id', context.userId).eq('status', 'inbox')
        ]);

        const profile = profileRes.data || {};
        const rawCommitments = commitmentsRes.data || [];
        const goals = goalsRes.data || [];
        const habits = habitsRes.data || [];
        const blocks = blocksRes.data || [];
        const inbox = inboxBlocks.data || [];

        // --- Deduplicate commitments by title+start_time+end_time ---
        // Onboarding or imports can create duplicate records with different UUIDs
        const seenCmtKeys = new Set<string>();
        const commitments = rawCommitments.filter((cmt: any) => {
            const key = `${cmt.title}|${cmt.start_time}|${cmt.end_time}|${JSON.stringify(cmt.days_of_week || [])}`;
            if (seenCmtKeys.has(key)) return false;
            seenCmtKeys.add(key);
            return true;
        });

        // --- Generate Virtual Blocks for Commitments ---
        // ONLY render anchors if the commitment has a valid days_of_week array
        // that explicitly includes this day. Commitments with null/empty days_of_week
        // are ignored (they are incomplete data).
        const virtualBlocks: any[] = [];
        // Build a set of existing commitment_id+date combos to avoid duplicates
        const existingCmtKeys = new Set(
            blocks
                .filter((b: any) => b.commitment_id)
                .map((b: any) => `${b.commitment_id}-${b.date}`)
        );

        for (let i = 0; i < days; i++) {
            const currentDate = addDays(startDate, i);
            const dateStr = format(currentDate, 'yyyy-MM-dd');
            let dayOfWeek = currentDate.getDay(); // 0 is Sunday
            const isoDay = dayOfWeek === 0 ? 7 : dayOfWeek;

            commitments.forEach((cmt: any) => {
                // STRICT: only render if days_of_week is a non-empty array containing this day
                if (!Array.isArray(cmt.days_of_week) || cmt.days_of_week.length === 0) return;
                if (!cmt.days_of_week.includes(isoDay)) return;

                // Skip if a real schedule_block already exists for this commitment+date
                const key = `${cmt.id}-${dateStr}`;
                if (existingCmtKeys.has(key)) return;

                virtualBlocks.push({
                    id: `virt-cmt-${cmt.id}-${dateStr}`,
                    user_id: cmt.user_id,
                    title: cmt.title || 'Anchor',
                    date: dateStr,
                    start_time: cmt.start_time,
                    end_time: cmt.end_time,
                    block_type: 'anchor',
                    status: 'planned',
                    is_locked: true,
                    commitment_id: cmt.id,
                    created_at: new Date().toISOString()
                });
            });
        }

        // Merge virtual anchor blocks with real database blocks
        const allBlocks = [...blocks, ...virtualBlocks];

        // --- Metrics Calculation ---
        const metrics = {
            planned: allBlocks.filter((b: any) => b.status === 'planned').length,
            done: allBlocks.filter((b: any) => b.status === 'done').length,
            missed: allBlocks.filter((b: any) => b.status === 'missed').length
        };

        // --- Conflict Detection ---
        const conflicts: any[] = [];
        const blocksByDay = allBlocks.reduce((acc: any, b: any) => {
            acc[b.date] = acc[b.date] || [];
            acc[b.date].push(b);
            return acc;
        }, {});

        Object.keys(blocksByDay).forEach(date => {
            const dayBlocks = blocksByDay[date];
            for (let i = 0; i < dayBlocks.length; i++) {
                for (let j = i + 1; j < dayBlocks.length; j++) {
                    const b1 = dayBlocks[i];
                    const b2 = dayBlocks[j];

                    const [h1, m1] = b1.start_time.split(':').map(Number);
                    const [h2, m2] = b1.end_time.split(':').map(Number);
                    const [h3, m3] = b2.start_time.split(':').map(Number);
                    const [h4, m4] = b2.end_time.split(':').map(Number);

                    const start1 = h1 * 60 + m1;
                    const end1 = h2 * 60 + m2;
                    const start2 = h3 * 60 + m3;
                    const end2 = h4 * 60 + m4;

                    if (start1 < end2 && end1 > start2) {
                        conflicts.push({
                            date,
                            block_ids: [b1.id, b2.id],
                            type: 'overlap',
                            severity: 'high'
                        });
                    }
                }
            }
        });

        return apiSuccess({
            range: { start: startStr, end: endStr },
            profile,
            commitments,
            goals,
            habitStacks: habits,
            inbox,
            blocks: allBlocks,
            metrics,
            conflicts
        });
    },
    { requireAuth: true }
);
