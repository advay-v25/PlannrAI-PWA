import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const userId = '8bb069d3-744f-4d4e-a2ea-8866fb981a70';

async function main() {
    console.log(`Fetching coach conversations and messages for user: ${userId}...`);

    const { data: convs, error: convsErr } = await supabase
        .from('coach_conversations')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

    if (convsErr) {
        console.error('Error fetching conversations:', convsErr);
        return;
    }

    if (!convs || convs.length === 0) {
        console.log('No conversations found.');
        return;
    }

    console.log(`Found ${convs.length} conversations. Checking the latest one: ${convs[0].id}`);
    const convId = convs[0].id;

    const { data: messages, error: msgsErr } = await supabase
        .from('coach_messages')
        .select('*')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true });

    if (msgsErr) {
        console.error('Error fetching messages:', msgsErr);
        return;
    }

    messages?.forEach((m, idx) => {
        console.log(`\n--- Message #${idx+1} [${m.role.toUpperCase()}] ---`);
        console.log(`Content: "${m.content}"`);
        if (m.options && Array.isArray(m.options)) {
            console.log(`Options (${m.options.length}):`);
            m.options.forEach((opt: any) => {
                console.log(`  - ID: ${opt.id} | Title: "${opt.title}" | Recommended: ${opt.recommended}`);
                console.log(`    Desc: "${opt.description}"`);
                console.log(`    Ops:`, JSON.stringify(opt.patch?.operations || opt.patch?.ops || []));
            });
        }
    });
}

main();
