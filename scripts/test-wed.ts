import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { buildCalendarContext } from '../src/lib/calendar/context-builder';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const userId = '08187789-1f62-47f7-b7d3-f1bc299b4446';
    const ctx = await buildCalendarContext(userId, supabase as any);
    const dir = path.join(__dirname, '../src/lib/calendar/ai/__tests__');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(path.join(dir, 'fixture-context.json'), JSON.stringify(ctx, null, 2));
}
main().catch(console.error);
