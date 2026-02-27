// @ts-nocheck

import { createClient } from '@supabase/supabase-js';
import { generateAIResponse } from '../src/lib/ai/groq-client';
import path from 'path';

// Use same env vars as other tests
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testPersonas() {
    console.log('🎭 Testing Dynamic Personas...\n');

    // Get a user
    const { data: { users }, error } = await supabase.auth.admin.listUsers();
    if (error || !users.length) {
        console.error('No users found');
        return;
    }
    const userId = users[0].id;

    const PROMPT = "I have so much to do today and I feel overwhelmed. What should I do?";
    const ENERGY_LEVELS = [1, 3, 5];

    console.log(`📝 User Prompt: "${PROMPT}"\n`);

    for (const energy of ENERGY_LEVELS) {
        let label = 'NEUTRAL (Partner)';
        if (energy === 1) label = 'LOW ENERGY (Nurse)';
        if (energy === 5) label = 'HIGH ENERGY (Commander)';

        console.log(`--- Testing Energy Level ${energy}: ${label} ---`);

        try {
            const response = await generateAIResponse(
                PROMPT,
                'COACH',
                userId,
                false, // jsonMode
                energy // Explicit energy level
            );

            console.log(`\n🤖 Response:\n${response}\n`);
            console.log('---------------------------------------------------\n');

        } catch (err) {
            console.error(`Error testing level ${energy}:`, err);
        }
    }
}

testPersonas();
