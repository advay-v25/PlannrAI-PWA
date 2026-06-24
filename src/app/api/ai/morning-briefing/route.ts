import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { executeAI } from '@/lib/ai/ai-service';
import { subDays } from 'date-fns';

export const maxDuration = 60;


export const POST = secureApiRoute(
    async (context) => {
        const { userId, supabase } = context;

        // 1. Gather context
        const today = new Date().toISOString().split('T')[0];
        const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];

        const [profileRes, blocksRes, goalsRes, yesterdayLogRes, overdueRes] = await Promise.all([
            supabase.from('profiles').select('full_name, energy_level').eq('id', userId).single(),
            supabase.from('schedule_blocks').select('title, start_time, end_time, block_type, status').eq('user_id', userId).eq('date', today).order('start_time'),
            supabase.from('goals').select('id, title, category, importance').eq('user_id', userId).eq('status', 'active').limit(10),
            supabase.from('daily_logs').select('energy_level, mood, notes').eq('user_id', userId).eq('log_date', yesterdayStr).single(),
            supabase.from('schedule_blocks').select('title').eq('user_id', userId).eq('date', yesterdayStr).neq('status', 'done').limit(5)
        ]);

        const userName = profileRes.data?.full_name || 'there';

        // 2. Build input for the daily_briefing channel
        const briefingInput = JSON.stringify({
            user: userName,
            energy: profileRes.data?.energy_level || 'unknown',
            today_blocks: (blocksRes.data || []).length,
            active_goals: (goalsRes.data || []).map(g => g.title),
            yesterday_mood: yesterdayLogRes.data?.mood || 'unknown',
            overdue_from_yesterday: (overdueRes.data || []).map(b => b.title)
        });

        // 3. Use unified AI pipeline
        const aiRes = await executeAI(userId, {
            channel: 'daily_briefing',
            input: briefingInput,
            context: {
                schedule: blocksRes.data || [],
                goals: goalsRes.data || [],
                yesterday: yesterdayLogRes.data || {}
            }
        });

        return apiSuccess({
            briefing: aiRes?.briefing || "Systems online. Schedule loaded. Proceed with objectives.",
            tone: aiRes?.tone || 'focused'
        });
    },
    { requireAuth: true, rateLimit: 'aiCoach', auditAction: 'morning_briefing' }
);
