import { executeAI } from '../src/lib/ai/ai-service';
import { openRouterChat } from '../src/lib/ai/openrouter-client';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function test() {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: user } = await supabase.from('profiles').select('id').limit(1).single();
    if (!user) {
        console.error('No user found');
        return;
    }

    console.log('Testing Brain Dump for user:', user.id);
    try {
        const result = await executeAI(user.id, {
            channel: 'brain_dump',
            input: 'I have a 45 min meeting with John tomorrow'
        });
        console.log('Success:', JSON.stringify(result, null, 2));
    } catch (e: any) {
        console.error('AI Error:', e);
    }
}

test();
