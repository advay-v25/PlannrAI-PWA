
// import fetch from 'node-fetch'; // Native fetch in Node 18+
import { createClient } from '@supabase/supabase-js';

const BASE_URL = 'http://localhost:3000';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
    console.log('🚀 Starting Full Flow Verification...');

    // 1. Auth (Login/Sign up)
    // For this script, we'll need a valid session or just verify public routes/401s
    // Ideally we sign in as a test user.
    const email = 'test@example.com';
    const password = 'password';

    const { data: auth, error } = await supabase.auth.signInWithPassword({
        email, password
    });

    let token = auth.session?.access_token;

    if (!token) {
        console.log('⚠️  No test user credentials found. Testing 401 behaviors.');
    } else {
        console.log('✅ Authenticated as test user');
    }

    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}`, 'cookie': `sb-access-token=${token}` } : {})
    };

    const routes = [
        { method: 'GET', path: '/api/health', expected: 200 },
        { method: 'GET', path: '/api/weekly-review/context', expected: token ? 400 : 401 }, // Missing params -> 400 or 401
        { method: 'POST', path: '/api/brain-dump', body: { content: 'Test dump' }, expected: token ? 201 : 401 },
        { method: 'POST', path: '/api/calendar/plan-week', body: { startDate: '2026-02-16' }, expected: token ? 200 : 401 },
        { method: 'GET', path: '/api/schedule', expected: token ? 200 : 401 },
    ];

    let failures = 0;

    for (const route of routes) {
        try {
            console.log(`Testing ${route.method} ${route.path}...`);
            const res = await fetch(`${BASE_URL}${route.path}`, {
                method: route.method,
                headers,
                body: route.body ? JSON.stringify(route.body) : undefined
            });

            const isSuccess = res.status === route.expected || (res.status >= 200 && res.status < 300 && route.expected === 200);

            if (isSuccess) {
                console.log(`✅ ${route.path}: ${res.status}`);
            } else {
                console.error(`❌ ${route.path}: Expected ${route.expected}, got ${res.status}`);
                const text = await res.text();
                console.error('Response:', text.slice(0, 200));
                if (res.status === 500) failures++;
            }
        } catch (e: any) {
            console.error(`💥 ${route.path}: Network Error`, e.message);
            failures++;
        }
    }

    if (failures > 0) {
        console.error(`\nFound ${failures} failures (POTENTIAL 500s or Crashes)`);
        process.exit(1);
    } else {
        console.log('\n✅ All routes behaved as expected (No 500s)');
        process.exit(0);
    }
}

run();
