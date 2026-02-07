import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({
        ok: true,
        env: process.env.NODE_ENV || 'development',
        time: new Date().toISOString(),
        version: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || 'local-dev'
    });
}
