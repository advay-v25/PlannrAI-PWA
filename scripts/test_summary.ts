import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
    const { data: commitments } = await supabase.from('commitments').select('*').eq('is_active', true);
    
    // Just run the anchor logic
    const startDate = new Date('2026-06-08T00:00:00.000Z'); // June 8 is Monday
    for (let i = 0; i < 7; i++) {
        // We use UTC to match test environment, but API uses local time
        // Just mock the getDay logic
        const currentDate = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
        const dateStr = currentDate.toISOString().split('T')[0];
        const dayOfWeek = currentDate.getDay();
        
        console.log("Day:", i, "Date:", dateStr, "DayOfWeek:", dayOfWeek);
        
        commitments?.forEach(cmt => {
            if (cmt.title.includes('CFA')) {
                if (!Array.isArray(cmt.days_of_week) || cmt.days_of_week.length === 0) return;
                const includes = cmt.days_of_week.includes(dayOfWeek);
                console.log(`  - ${cmt.title} includes ${dayOfWeek}? ${includes}`);
            }
        });
    }
}
main();
