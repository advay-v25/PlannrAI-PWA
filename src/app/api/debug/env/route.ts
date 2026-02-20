import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({
        groq_exists: !!process.env.GROQ_API_KEY,
        groq_prefix: process.env.GROQ_API_KEY ? process.env.GROQ_API_KEY.substring(0, 5) : null,
        node_env: process.env.NODE_ENV,
        has_supabase: !!process.env.NEXT_PUBLIC_SUPABASE_URL
    });
}
