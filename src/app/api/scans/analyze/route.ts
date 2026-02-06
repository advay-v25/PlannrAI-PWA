import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateAIResponse } from '@/lib/ai/groq-client';

// Handler for file upload and analysis
export async function POST(req: NextRequest) {
    const supabase = await createClient();

    // 1. Auth Check
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // 2. Parse FormData
        const formData = await req.formData();
        const file = formData.get('file') as File;
        const type = formData.get('type') as string;

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        // 3. Upload to Supabase Storage
        // Sanitize filename
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;

        const { data: uploadData, error: uploadError } = await supabase
            .storage
            .from('scans')
            .upload(fileName, file);

        if (uploadError) {
            console.error("Storage Error:", uploadError);
            return NextResponse.json({ error: 'Upload failed. Ensure "scans" bucket exists.', details: uploadError.message }, { status: 500 });
        }

        // 4. Get Public URL (Vision Models need this)
        const { data: { publicUrl } } = supabase
            .storage
            .from('scans')
            .getPublicUrl(fileName);

        // 5. Vision Analysis
        const prompts = {
            physique: "Analyze this body composition. Estimate approximate Body Fat percentage range and Muscle Mass levels. Identify key areas for improvement. Output JSON with fields: 'body_fat_estimate', 'muscle_mass_assessment', 'suggested_focus', 'summary'.",
            equipment: "Identify all visible gym equipment. List 5 specific exercises I can do with this gear. Output JSON with fields: 'equipment_detected' (array), 'exercises' (array), 'summary'.",
            food: "Analyze this meal. Estimate macronutrients (Protein, Carbs, Fats) and Calories. Output JSON with fields: 'macros' (object with p,c,f,cal), 'health_rating' (1-10), 'summary'.",
            general: "Analyze this image for fitness or productivity context. Output JSON with field 'summary'."
        };

        const prompt = prompts[type as keyof typeof prompts] || prompts.general;

        const aiResponse = await generateAIResponse(
            prompt,
            'ANALYST',
            user.id,
            true, // Enable JSON mode
            undefined, // No specific energy level context for scans
            publicUrl // Pass Image URL as 6th argument
        );

        let analysisResult;
        try {
            analysisResult = JSON.parse(aiResponse);
        } catch (e) {
            analysisResult = { summary: aiResponse };
        }

        return NextResponse.json({
            success: true,
            analysis: analysisResult,
            imageUrl: publicUrl
        });

    } catch (e: any) {
        console.error("Scan Error:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
