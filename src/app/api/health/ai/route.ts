import { NextResponse } from 'next/server';
import { groqChat } from '@/lib/ai/groq-client';

export const runtime = 'nodejs';

export async function GET(request: Request) {
    const hasKey = !!process.env.GROQ_API_KEY;

    // Optional auth check for external monitors
    const authHeader = request.headers.get('authorization');
    const isValidCron = authHeader === `Bearer ${process.env.CRON_SECRET}` || process.env.NODE_ENV === 'development';
    
    if (!isValidCron) {
        return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 401 });
    }

    try {
        if (!hasKey) throw new Error('GROQ_API_KEY missing');

        const start = Date.now();
        let ping: string;
        let modelUsed: string;

        try {
            // Try primary model first
            modelUsed = 'llama-3.3-70b-versatile';
            ping = await groqChat({
                model: modelUsed,
                messages: [{ role: 'user', content: 'ping' }],
                max_tokens: 10
            });
        } catch {
            // Fallback to smaller model
            modelUsed = 'llama-3.1-8b-instant';
            ping = await groqChat({
                model: modelUsed,
                messages: [{ role: 'user', content: 'ping' }],
                max_tokens: 10
            });
        }

        const duration = Date.now() - start;

        return NextResponse.json({
            status: 'ok',
            latency: duration,
            key_configured: true,
            model: modelUsed,
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
