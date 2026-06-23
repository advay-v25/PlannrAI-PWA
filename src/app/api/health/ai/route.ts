import { NextResponse } from 'next/server';
import { groqChat } from '@/lib/ai/groq-client';

export const maxDuration = 60;


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

        // Simply check configuration, do not burn real AI tokens
        return NextResponse.json({
            status: 'ok',
            key_configured: true,
            model_response: 'simulated_pong'
        });
    } catch (error: any) {
        return NextResponse.json({
            status: 'error',
            error: error.message,
            key_configured: hasKey
        }, { status: 500 });
    }
}
