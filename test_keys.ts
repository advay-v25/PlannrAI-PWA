import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function checkKey(name: string, url: string, authHeader: string) {
    if (!process.env[name]) {
        console.log(`[ ] ${name}: Not Configured`);
        return;
    }
    try {
        const start = Date.now();
        const res = await fetch(url, {
            headers: {
                'Authorization': authHeader.replace('TOKEN', process.env[name] as string),
                'Content-Type': 'application/json'
            }
        });
        const latency = Date.now() - start;
        if (res.ok) {
            console.log(`[OK] ${name}: Healthy (${latency}ms)`);
        } else {
            console.log(`[ERROR] ${name}: ${res.status} ${res.statusText}`);
            console.log(await res.text());
        }
    } catch (e: any) {
        console.log(`[FAIL] ${name}: ${e.message}`);
    }
}

async function main() {
    console.log("Checking API Keys...");
    await checkKey('GROQ_API_KEY', 'https://api.groq.com/openai/v1/models', 'Bearer TOKEN');
    await checkKey('OPENROUTER_API_KEY', 'https://openrouter.ai/api/v1/models', 'Bearer TOKEN');
    await checkKey('GEMINI_API_KEY', `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`, '');
    await checkKey('CEREBRAS_API_KEY', 'https://api.cerebras.ai/v1/models', 'Bearer TOKEN');
    await checkKey('CALENDAR_NVIDIA_API_KEY', 'https://integrate.api.nvidia.com/v1/models', 'Bearer TOKEN');
    await checkKey('NVIDIA_API_KEY', 'https://integrate.api.nvidia.com/v1/models', 'Bearer TOKEN');
    await checkKey('NVIDIA_API_KEY_TERTIARY', 'https://integrate.api.nvidia.com/v1/models', 'Bearer TOKEN');
}

main();
