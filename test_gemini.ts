import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function checkInferenceGemini() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return;
    try {
        const start = Date.now();
        const payload = {
            contents: [{ parts: [{ text: "Say hello!" }] }]
        };
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000); 
        
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
        console.log(`[START] GEMINI_API_KEY ...`);
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        });
        clearTimeout(timeout);
        
        const latency = Date.now() - start;
        if (res.ok) {
            console.log(`[OK] GEMINI_API_KEY: ${latency}ms`);
        } else {
            console.log(`[ERROR] GEMINI_API_KEY: ${res.status} ${res.statusText}`);
            console.log(await res.text());
        }
    } catch (e: any) {
        console.log(`[FAIL] GEMINI_API_KEY: ${e.name} - ${e.message}`);
    }
}
checkInferenceGemini();
