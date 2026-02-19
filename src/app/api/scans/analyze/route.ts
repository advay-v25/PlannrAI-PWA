import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { groqChat } from '@/lib/ai/groq-client';

export async function POST(req: NextRequest) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;
        const type = formData.get('type') as string;

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        // Upload to Supabase Storage
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;

        const { data: uploadData, error: uploadError } = await supabase
            .storage
            .from('scans')
            .upload(fileName, file);

        if (uploadError) {
            return NextResponse.json({ error: 'Upload failed.', details: uploadError.message }, { status: 500 });
        }

        const { data: { publicUrl } } = supabase
            .storage
            .from('scans')
            .getPublicUrl(fileName);

        // Vision Analysis via groqChat (unique use case — image analysis)
        const prompts: Record<string, string> = {
            physique: "Analyze this body composition. Estimate Body Fat % range and Muscle Mass levels. Output JSON: { body_fat_estimate, muscle_mass_assessment, suggested_focus, summary }",
            equipment: "Identify gym equipment. List 5 exercises. Output JSON: { equipment_detected: [], exercises: [], summary }",
            food: "Analyze this meal's macros & calories. Output JSON: { macros: {p,c,f,cal}, health_rating: 1-10, summary }",
            general: "Analyze this image for fitness/productivity context. Output JSON: { summary }"
        };

        const prompt = prompts[type] || prompts.general;

        const aiResponse = await groqChat({
            model: 'llama-3.3-70b-versatile',
            messages: [
                { role: 'system', content: 'You are an expert analyst. Return ONLY valid JSON. No markdown.' },
                { role: 'user', content: `${prompt}\n\nImage URL: ${publicUrl}` }
            ],
            temperature: 0.3,
            max_tokens: 1000,
            userId: user.id
        });

        let analysisResult;
        try {
            analysisResult = JSON.parse(aiResponse);
        } catch {
            analysisResult = { summary: aiResponse };
        }

        return NextResponse.json({ success: true, analysis: analysisResult, imageUrl: publicUrl });
    } catch (e: any) {
        console.error("Scan Error:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
