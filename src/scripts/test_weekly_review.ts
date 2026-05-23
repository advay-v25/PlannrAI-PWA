import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

async function run() {
    // Force useNvidia = true in callAI
    const { callAI } = await import('../lib/ai/unified-client');
    try {
        const aiRes = await callAI({
            model: 'smart',
            systemPrompt: 'You are a bot. Return a mock JSON matching weekly review.',
            prompt: 'Test',
            requireJSON: true,
            useNvidia: true
        });
        console.log("Success?", aiRes.success);
        console.log("Provider used:", aiRes.provider);
        console.log("Data:", aiRes.data);
    } catch(e: any) {
        console.error("Error generating report:", e);
    }
}
run();
