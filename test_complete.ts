import { POST } from './src/app/api/onboarding/complete/route';
import { NextRequest } from 'next/server';

async function test() {
    const req = new NextRequest('http://localhost:3000/api/onboarding/complete', {
        method: 'POST',
        headers: {
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            full_name: "Test User",
            sleep_start: "22:00",
            sleep_end: "06:00"
        })
    });
    const res = await POST(req);
    console.log(res.status);
    console.log(await res.text());
}

test();
