import { NextResponse } from 'next/server';
import { generateCoachResponse } from '@/lib/coach/response-generator';
import { buildCoachContext } from '@/lib/coach/context-builder';
import { buildCalendarContext } from '@/lib/calendar/context-builder';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: users } = await supabase.from('profiles').select('id').limit(1);
    if (!users || users.length === 0) return NextResponse.json({ error: 'No user' });

    const userId = users[0].id;
    const coachCtx = await buildCoachContext(userId, supabase);
    const calCtx = await buildCalendarContext(userId, supabase);

    // Override console.log to capture logs
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args) => {
      logs.push(args.join(' '));
      originalLog(...args);
    };

    const res = await generateCoachResponse(
      "I need to go grocery shopping tomorrow",
      [],
      coachCtx,
      supabase,
      calCtx
    );

    console.log = originalLog;

    return NextResponse.json({
      success: true,
      logs,
      response: res,
      env: {
        hasNvidia: !!process.env.CALENDAR_NVIDIA_API_KEY || !!process.env.NVIDIA_API_KEY,
        hasGroqBackup: !!process.env.GROQ_BACKUP_KEY,
        hasGroqApi: !!process.env.GROQ_API_KEY,
        hasOpenRouter: !!process.env.OPENROUTER_API_KEY,
      }
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message, stack: err.stack });
  }
}
