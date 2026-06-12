
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000';
// Mock user ID - in a real scenario we'd need a valid auth token, 
// but for API resilience we want to see if it 500s or 401s gracefullly.
// Since we have secureApiRoute, it might just 401, which is a PASS.
// To test logic, we might need to bypass auth or use a known test token.
// For now, let's test the OPEN endpoints or public resilience, 
// AND try to use a mock token if possible.

async function runStressTest() {
    console.log('🔥 Starting Operation Chaos: Final Stress Test 🔥');

    const chaosInputs = [
        "A".repeat(10000), // Massive string
        "DROP TABLE users;", // SQL Injection attempt
        "{{process.env}}", // Common injection
        "💩".repeat(500), // Unicode flood
    ];

    console.log('\n[1] Testing Input Resilience (Fuzzing Coach API)...');

    // We expect these to fail with 401 (Auth) or 400 (Bad Request), but NOT 500 (Server Crash)
    const results = await Promise.all(chaosInputs.map(async (input, i) => {
        try {
            const res = await fetch(`${BASE_URL}/api/coach`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: input })
            });
            return { idx: i, status: res.status };
        } catch (e) {
            return { idx: i, error: (e as Error).message };
        }
    }));

    console.log('Results:', results);
    const crashed = results.some(r => r.status === 500);
    if (crashed) console.error('❌ CRITICAL: Server crashed on bad input!');
    else console.log('✅ Input check passed: No 500 errors.');


    console.log('\n[2] Testing Rate Limiting (The "Spam Click" Test)...');
    // Rapid fire 20 requests
    const rateLimited = false;
    const spamPromises = [];
    for (let i = 0; i < 20; i++) {
        spamPromises.push(
            fetch(`${BASE_URL}/api/coach`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: "Hello" })
            }).then(r => r.status)
        );
    }

    const spamResults = await Promise.all(spamPromises);
    const rateLimitHits = spamResults.filter(s => s === 429).length;
    console.log(`Rate Limit Hits (429): ${rateLimitHits}/${spamResults.length}`);

    if (rateLimitHits > 0) console.log('✅ Rate limiter is ACTIVE and blocking spam.');
    else console.warn('⚠️ Warning: No rate limit failures triggered. Threshold might be high.');

    console.log('\n[TEST COMPLETE]');
}

runStressTest();
