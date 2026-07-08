import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function checkInferenceGemini() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return;
    try {
        const start = Date.now();
        const payload = {
            model: 'gemini-2.0-flash',
            messages: [{ role: "user", content: "Say hello!" }],
            max_tokens: 10
        };
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000); 
        
        const url = `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`;
        console.log(`[START] GEMINI_API_KEY to OpenAI compat ...`);
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        });
        clearTimeout(timeout);
        
        const latency = Date.now() - start;
        if (res.ok) {
            const data = await res.json();
            console.log(`[OK] GEMINI_API_KEY: ${latency}ms - ${data.choices?.[0]?.message?.content?.trim() || 'Success'}`);
        } else {
            console.log(`[ERROR] GEMINI_API_KEY: ${res.status} ${res.statusText}`);
            console.log(await res.text());
        }
    } catch (e: any) {
        console.log(`[FAIL] GEMINI_API_KEY: ${e.name} - ${e.message}`);
    }
}
checkInferenceGemini();
