import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
dotenv.config({ path: '.env.local' });

// We use ts-node to execute this script in package.json context
import { buildCalendarContext } from '../src/lib/calendar/context-builder';

async function main() {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: users } = await supabase.from('profiles').select('id').limit(1);
    const userId = users![0].id;
    
    // We need mock request headers since context-builder uses `createClient()` internally sometimes?
    // Oh wait, context-builder takes a `supabase` client as an argument!
    const ctx = await buildCalendarContext(supabase as any, userId);
    
    const outPath = path.join(__dirname, '../src/lib/calendar/ai/__tests__/golden-context.json');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(ctx, null, 2));
    console.log(`Dumped context to ${outPath}`);
}
main().catch(console.error);
