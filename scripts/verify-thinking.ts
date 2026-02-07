
import { createClient } from '@/lib/supabase/server';
import { ThinkingService } from '@/lib/intelligence/thinking-service';
import { AnalysisService } from '@/lib/intelligence/analysis-service';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

async function verifyThinking() {
    console.log('--- Superintelligence Thinking Verification ---');

    // 1. Get a test user
    const supabase = await createClient();
    const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();

    if (userError || !users || users.length === 0) {
        console.error('Failed to get users. Make sure your service role key allows admin access or use a hardcoded ID.');
        // Fallback to a known ID if possible, or exit
        return;
    }

    const testUser = users[0];
    const userId = testUser.id;
    const date = new Date().toISOString().split('T')[0];

    console.log(`Testing with User: ${testUser.email} (${userId})`);

    // 2. Inject a "Stress" signal into UserContext to force a burnout intervention
    console.log('Injecting high-stress context...');
    await supabase.from('user_context').upsert({
        user_id: userId,
        type: 'fact',
        content: 'User expressed severe burnout and schedule overwhelm in recent brain dump.',
        confidence: 0.95,
        source: 'manual_verification'
    });

    // 3. Trigger Thinking Analysis
    console.log('Triggering Thinking Synthesis...');
    const result = await ThinkingService.analyze(userId, date, supabase);

    console.log('Thinking Result:', JSON.stringify(result, null, 2));

    // 4. Check if intervention was created
    const { data: interventions } = await supabase
        .from('ai_interventions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1);

    if (interventions && interventions.length > 0) {
        console.log('SUCCESS: Proactive Intervention Created!');
        console.log('Message:', interventions[0].message);
        console.log('Type:', interventions[0].type);
    } else {
        console.log('WARN: No intervention created. AI might have decided it was not necessary.');
    }
}

verifyThinking().catch(console.error);
