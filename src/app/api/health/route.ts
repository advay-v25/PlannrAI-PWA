import { createClient } from '@/lib/supabase/server';
import { apiSuccess, apiFail } from '@/lib/api/envelope';

export async function GET() {
    try {
        // Check: Supabase Connectivity
        const supabase = await createClient();
        const { error: dbError } = await supabase.from('profiles').select('id').limit(1);

        const healthData = {
            status: dbError ? 'degraded' : 'healthy',
            supabase_ok: !dbError,
            version: '1.0.0'
        };

        if (dbError) {
            console.error("Health DB Error", dbError);
            return apiSuccess(healthData, 200); // Return 200 but report degraded
        }

        return apiSuccess(healthData);

    } catch (e: any) {
        return apiFail("Health check crashed", 500, "HEALTH_CRASH", e.message);
    }
}
