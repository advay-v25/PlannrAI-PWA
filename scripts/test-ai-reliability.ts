
import { apiClient } from '../src/lib/api-client';

// Mock the API client for local testing if needed, or just use fetch directly
const TEST_ENDPOINT = 'http://localhost:3000/api/ai/execute';

async function testAIGateway() {
    console.log('🧪 Testing AI Gateway Scalability & Error Handling...');

    const tests = [
        {
            name: '1. Basic Coach Chat',
            payload: {
                channel: 'coach',
                input: 'Hello, are you online?',
                context: { userId: 'test-user' }
            }
        },
        {
            name: '2. Brain Dump (Medium Payload)',
            payload: {
                channel: 'brain_dump',
                input: 'I need to buy milk, call mom, and finish the report. I am feeling a bit stressed.',
                context: { userId: 'test-user' }
            }
        }
    ];

    for (const test of tests) {
        console.log(`\n▶️ Running: ${test.name}`);
        try {
            const start = Date.now();
            const res = await fetch(TEST_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(test.payload)
            });

            const data = await res.json();
            const duration = Date.now() - start;

            if (res.status === 200 && data.ok) {
                console.log(`✅ Success (${duration}ms):`, data.data?.intent || 'OK');
            } else {
                console.error(`❌ Failed (${duration}ms): ${res.status}`, data);
            }
        } catch (e: any) {
            console.error(`❌ Network Error:`, e.message);
        }
    }
}

// Ensure the server is running before executing this
console.log('NOTE: Ensure localhost:3000 is running.');
// testAIGateway(); 
