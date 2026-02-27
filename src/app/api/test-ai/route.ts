import { callAI } from '@/lib/ai/unified-client';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    const tests = [
        {
            name: 'Groq (Primary)',
            options: {
                prompt: 'Return exactly this JSON: {"status":"ok","provider":"groq","test":true}',
                systemPrompt: 'Return only valid JSON. No markdown, no explanation.',
                model: 'fast' as const,
                requireJSON: true,
                timeout: 10000,
            }
        },
        {
            name: 'OpenRouter (Fallback)',
            options: {
                prompt: 'Return exactly this JSON: {"status":"ok","provider":"openrouter","test":true}',
                systemPrompt: 'Return only valid JSON. No markdown, no explanation.',
                model: 'creative' as const,
                requireJSON: true,
                timeout: 15000,
            }
        }
    ];

    const results = [];
    for (const test of tests) {
        const result = await callAI(test.options);
        results.push({
            test: test.name,
            success: result.success,
            provider: result.provider,
            model: result.model,
            latency_ms: result.latency_ms,
            data: result.data,
            error: result.error,
        });
    }

    return NextResponse.json({
        timestamp: new Date().toISOString(),
        results,
        summary: {
            passed: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
        }
    });
}
