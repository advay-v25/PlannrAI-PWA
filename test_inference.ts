import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function checkInference(name: string, url: string, model: string, authHeader: string) {
    if (!process.env[name]) {
        console.log(`[ ] ${name}: Not Configured`);
        return;
    }
    try {
        const start = Date.now();
        const payload = {
            model: model,
            messages: [{ role: "user", content: "Say hello!" }],
            max_tokens: 10
        };
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': authHeader.replace('TOKEN', process.env[name] as string),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        const latency = Date.now() - start;
        if (res.ok) {
            const data = await res.json();
            console.log(`[OK] ${name} (${model}): ${latency}ms - ${data.choices?.[0]?.message?.content?.trim() || 'Success'}`);
        } else {
            console.log(`[ERROR] ${name} (${model}): ${res.status} ${res.statusText}`);
            console.log(await res.text());
        }
    } catch (e: any) {
        console.log(`[FAIL] ${name} (${model}): ${e.message}`);
    }
}

async function main() {
    console.log("Testing Inference...");
    await checkInference('GROQ_API_KEY', 'https://api.groq.com/openai/v1/chat/completions', 'llama-3.3-70b-versatile', 'Bearer TOKEN');
    await checkInference('OPENROUTER_API_KEY', 'https://openrouter.ai/api/v1/chat/completions', 'openai/gpt-4o-mini', 'Bearer TOKEN');
    await checkInference('CALENDAR_NVIDIA_API_KEY', 'https://integrate.api.nvidia.com/v1/chat/completions', 'meta/llama-3.1-70b-instruct', 'Bearer TOKEN');
}

main();
