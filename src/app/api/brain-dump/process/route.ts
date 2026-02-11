import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildBrainDumpContext, saveBrainDump, saveBrainDumpExtraction, updateUserStateFromSignals } from '@/lib/brain-dump/brain-dump-context';
import { BrainDumpService } from '@/lib/brain-dump/brain-dump-service';

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { text } = await request.json();
        if (!text) return NextResponse.json({ error: 'Text required' }, { status: 400 });

        // 1. Save Raw Dump
        const dumpId = await saveBrainDump(user.id, text, supabase);

        // 2. Build Context
        const context = await buildBrainDumpContext(user.id, supabase);

        // 3. Process with AI
        const { analysis, patches } = await BrainDumpService.process(text, context);

        // 4. Persistence (Async)
        await saveBrainDumpExtraction(user.id, dumpId, analysis.extracted, supabase);
        await updateUserStateFromSignals(user.id, analysis.extracted.signals, supabase);

        return NextResponse.json({
            analysis,
            patches, // Ready for preview
            dumpId
        });

    } catch (error: any) {
        console.error('Brain Dump Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
