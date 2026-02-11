import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000';

const ROUTES = [
    { method: 'GET', path: '/api/health' },
    { method: 'GET', path: '/api/anchors' }, // Should fail 401 but return JSON
    { method: 'GET', path: '/api/schedule' },
    { method: 'GET', path: '/api/habit-stacks' },
    { method: 'POST', path: '/api/behavior/signal', body: { action: 'smoke_test' } }, // Should 200
];

async function runSmoke() {
    console.log("💨 Starting API Smoke Test...");
    let failed = 0;

    for (const route of ROUTES) {
        const url = `${BASE_URL}${route.path}`;
        try {
            console.log(`Checking ${route.method} ${route.path}...`);
            const res = await fetch(url, {
                method: route.method,
                headers: { 'Content-Type': 'application/json' },
                body: route.body ? JSON.stringify(route.body) : undefined
            });

            const contentType = res.headers.get('content-type');
            if (!contentType?.includes('application/json')) {
                console.error(`❌ ${route.path} returned NON-JSON: ${contentType}`);
                failed++;
                continue;
            }

            const json: any = await res.json();

            // Check envelope
            if (typeof json.ok !== 'boolean' || !json.request_id) {
                console.error(`❌ ${route.path} INVALID ENVELOPE`, json);
                failed++;
                continue;
            }

            // Status checks
            if (res.status === 500) {
                console.error(`❌ ${route.path} returned 500!`, json);
                failed++;
                continue;
            }

            if (res.status === 404) {
                console.error(`❌ ${route.path} returned 404!`);
                failed++;
                continue;
            }

            console.log(`✅ ${route.path} OK (${res.status}) [${json.request_id}]`);

        } catch (e: any) {
            console.error(`❌ ${route.path} FAILED TO FETCH`, e.message);
            failed++;
        }
    }

    console.log(`\nSmoke Test Complete. Failed: ${failed}`);
    process.exit(failed > 0 ? 1 : 0);
}

runSmoke();
