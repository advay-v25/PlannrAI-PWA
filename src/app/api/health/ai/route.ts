import { NextResponse } from 'next/server';
import { groqChat } from '@/lib/ai/groq-client';

export const runtime = 'nodejs';

export async function GET() {
    const hasKey = !!process.env.GROQ_API_KEY;

    try {
        if (!hasKey) throw new Error('GROQ_API_KEY missing');

        const start = Date.now();
        const ping = await groqChat({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: 'ping' }],
            max_tokens: 10
        });
        const duration = Date.now() - start;

        return NextResponse.json({
            status: 'ok',
            latency: duration,
            key_configured: true,
            model_response: ping.slice(0, 20)
        });
    } catch (error: any) {
        return NextResponse.json({
            status: 'error',
            error: error.message,
            key_configured: hasKey
        }, { status: 500 });
    }
}
