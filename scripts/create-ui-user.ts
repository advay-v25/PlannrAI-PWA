
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const USER_EMAIL = 'ui_test@example.com';
const USER_PASSWORD = 'password123';

async function setupUIUser() {
    console.log('👤 Creating UI Test User...');

    // 1. Create User
    let userId;
    const { data, error } = await supabase.auth.admin.createUser({
        email: USER_EMAIL,
        password: USER_PASSWORD,
        email_confirm: true
    });

    if (error) {
        // If exists, find valid ID
        const { data: users } = await supabase.auth.admin.listUsers();
        const existing = users.users.find(u => u.email === USER_EMAIL);
        if (existing) {
            userId = existing.id;
            console.log(`✅ Using existing user: ${userId}`);

            // Clean slate
            await supabase.from('goals').delete().eq('user_id', userId);
            await supabase.from('schedule_blocks').delete().eq('user_id', userId);
        } else {
            console.error('Failed to create user:', error.message);
            return;
        }
    } else {
        userId = data.user.id;
        console.log(`✅ Created test user: ${userId}`);

        // Profile
        await supabase.from('profiles').insert({
            id: userId,
            full_name: "UI Stress Tester",
            timezone: "UTC",
            ai_can_suggest: true,
            ai_can_analyze: true
        });
    }

    // 2. Add Massive Data
    console.log('   - Adding 50 Goals...');
    const goals = Array.from({ length: 50 }).map((_, i) => ({
        user_id: userId,
        title: `UI Test Goal ${i} - ${"long text ".repeat(Math.random() * 5)}`,
        category: i % 3 === 0 ? 'mind' : i % 3 === 1 ? 'body' : 'future',
        importance: ['low', 'medium', 'high'][i % 3],
        minutes_per_day: 10 + i,
        is_paused: false
    }));
    await supabase.from('goals').insert(goals);

    console.log('   - Adding 50 Schedule Blocks...');
    const today = new Date().toISOString().split('T')[0];
    const blocks = Array.from({ length: 50 }).map((_, i) => ({
        user_id: userId,
        date: today,
        start_time: `${10 + Math.floor(i / 60)}:${(i % 60).toString().padStart(2, '0')}`,
        end_time: `${10 + Math.floor((i + 5) / 60)}:${((i + 5) % 60).toString().padStart(2, '0')}`,
        status: ['planned', 'done', 'missed'][i % 3],
        context: `UI Test Block ${i}`
    }));
    await supabase.from('schedule_blocks').insert(blocks);

    console.log('✅ UI Test User Ready!');
    console.log(`   Email: ${USER_EMAIL}`);
    console.log(`   Pass:  ${USER_PASSWORD}`);
}

setupUIUser();
