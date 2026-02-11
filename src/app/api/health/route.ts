
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client'; // or server? Client is fine for checking connection if anon key works
import { apiSuccess, apiError } from '@/lib/api/api-utils';

export const dynamic = 'force-dynamic';

export async function GET() {
    const supabase = createClient();

    let supabaseOk = false;
    let aiOk = false;

    // Check Supabase
    try {
        const { data, error } = await supabase.from('profiles').select('count', { count: 'exact', head: true });
        if (!error) {
            supabaseOk = true;
        } else {
            console.error('Health Check: Supabase Error', error);
        }
    } catch (e) {
        console.error('Health Check: Supabase Exception', e);
    }

    // Check AI (Groq)
    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey) {
        // Lightweight check: Just models list or simple completion
        try {
            const res = await fetch('https://api.groq.com/openai/v1/models', {
                headers: {
                    Authorization: `Bearer ${groqKey}`,
                    'Content-Type': 'application/json'
                }
            });
            if (res.ok) {
                aiOk = true;
            } else {
                console.error('Health Check: Groq API Error', res.statusText);
            }
        } catch (e) {
            console.error('Health Check: Groq Exception', e);
        }
    }

    const envStatus = {
        supabase_url_present: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        supabase_anon_present: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        groq_key_present: !!process.env.GROQ_API_KEY
    };

    return apiSuccess({
        env: envStatus,
        supabase_ok: supabaseOk,
        ai_ok: aiOk
    });
}
