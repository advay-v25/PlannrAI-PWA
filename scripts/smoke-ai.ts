import { createClient } from '@supabase/supabase-js';

// Load env
const SCRIPT_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
// We need a way to authenticate. For smoke testing, we might need a test user token
// or just rely on a bypass if we are running in dev/local. 
// However, the route requires auth ("requireAuth: true"). 
// So we need a valid session token OR we can disable auth for the smoke test temporarily 
// but that defeats the purpose.
// Assuming we have a test user or we can simulate it.
// For now, let's just create a dummy script structure that users can run if they provide a token.

const CHANNELS = [
    'coach',
    'brain_dump',
    'weekly_review',
    'goal_strategy',
    'calendar_optimize'
];

async function runSmokeTest() {
    console.log("💨 Starting AI Smoke Test...");

    const token = process.env.TEST_USER_TOKEN;
    if (!token) {
        console.warn("⚠️ No TEST_USER_TOKEN provided. Some authenticated routes may fail.");
    }

    const results = [];

    for (const channel of CHANNELS) {
        console.log(`Testing channel: ${channel}...`);
        try {
            const res = await fetch(`${SCRIPT_URL}/api/ai/execute`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    channel,
                    input: "Smoke test input: verifying reliability.",
                    context: { smoke_test: true }
                })
            });

            const data = await res.json();
            const passed = res.ok && data.summary !== "AI temporarily unavailable. Choose a safe fallback.";
            // Fallback is also a "pass" for uptime, but we want to know if it degraded.

            results.push({
                channel,
                status: res.status,
                ok: res.ok,
                requestId: data._meta?.request_id,
                degraded: data._meta?.degraded || false,
                latency: data._meta?.latency_ms
            });

        } catch (e: any) {
            results.push({ channel, status: 'error', error: e.message });
        }
    }

    console.table(results);
}

runSmokeTest();
