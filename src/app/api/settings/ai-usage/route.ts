import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { startOfDay, startOfMonth } from 'date-fns';

export const maxDuration = 60;

export const GET = secureApiRoute(async (context) => {
    const { supabase, user } = context;

    const now = new Date();
    const dayStart = startOfDay(now).toISOString();
    const monthStart = startOfMonth(now).toISOString();

    // Count for today
    const { count: dailyCount, error: dailyError } = await supabase
        .from('security_audit_log')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('action', 'ai_execute')
        .gte('created_at', dayStart);

    // Count for this month
    const { count: monthlyCount, error: monthlyError } = await supabase
        .from('security_audit_log')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('action', 'ai_execute')
        .gte('created_at', monthStart);

    if (dailyError || monthlyError) {
        throw new Error('Failed to fetch stats');
    }

    return apiSuccess({
        daily: dailyCount || 0,
        monthly: monthlyCount || 0,
        limit: 14400 // Daily limit (Groq free tier)
    });
}, { requireAuth: true, rateLimit: 'userStrict', auditAction: 'fetch_ai_usage' });
