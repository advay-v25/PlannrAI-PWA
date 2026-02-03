import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateAIResponse, SYSTEM_PROMPTS } from '@/lib/ai/groq-client';
import { sanitizeForAI } from '@/lib/security/input-validator';

// POST: AI categorizes a brain dump and extracts actionable items
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { content, dumpId } = body;

        if (!content || typeof content !== 'string') {
            return NextResponse.json({ error: 'Content is required' }, { status: 400 });
        }

        // Check user AI preferences
        const { data: profile } = await supabase
            .from('profiles')
            .select('ai_can_analyze')
            .eq('id', user.id)
            .single();

        if (!profile?.ai_can_analyze) {
            return NextResponse.json({
                categories: ['general'],
                extractedTasks: [],
                themes: [],
                sentiment: 'neutral',
                message: 'AI analysis disabled in settings'
            });
        }

        // Prepare the prompt
        const sanitizedContent = sanitizeForAI(content);

        const prompt = `Analyze this brain dump entry and provide structured insights:

"${sanitizedContent}"

Return a JSON object with:
1. "categories": Array of 1-3 categories from: ["work", "personal", "health", "relationships", "finances", "creativity", "stress", "planning", "reflection"]
2. "extractedTasks": Array of up to 5 actionable tasks found in the text, each with { "title": string, "priority": "high" | "medium" | "low", "category": string }
3. "themes": Array of 2-4 recurring themes or patterns detected
4. "sentiment": Overall emotional tone: "positive", "neutral", "stressed", "anxious", "hopeful", "frustrated"
5. "keyInsight": One sentence summary of the main point or concern

Be concise and practical. Focus on actionable insights.`;

        // Call Groq API via wrapper to handle rate limits and logging
        const responseText = await generateAIResponse(
            prompt,
            'SMART_CATEGORIZATION',
            user.id
        );
        let analysis;

        try {
            analysis = JSON.parse(responseText);
        } catch {
            // Fallback if JSON parsing fails
            analysis = {
                categories: ['general'],
                extractedTasks: [],
                themes: ['reflection'],
                sentiment: 'neutral',
                keyInsight: 'Unable to fully analyze this entry.'
            };
        }

        // Ensure required fields exist
        const result = {
            categories: analysis.categories || ['general'],
            extractedTasks: analysis.extractedTasks || [],
            themes: analysis.themes || [],
            sentiment: analysis.sentiment || 'neutral',
            keyInsight: analysis.keyInsight || ''
        };

        // If dumpId provided, update the brain dump with analysis
        if (dumpId) {
            await supabase
                .from('brain_dumps')
                .update({
                    ai_categories: result.categories,
                    ai_themes: result.themes,
                    ai_sentiment: result.sentiment
                })
                .eq('id', dumpId)
                .eq('user_id', user.id);
        }

        return NextResponse.json(result);

    } catch (error: any) {
        console.error('AI categorization error:', error);

        if (error?.status === 401) {
            return NextResponse.json({ error: 'AI service authentication failed' }, { status: 500 });
        }

        // Fallback response
        return NextResponse.json({
            categories: ['general'],
            extractedTasks: [],
            themes: [],
            sentiment: 'neutral',
            keyInsight: '',
            error: 'AI analysis temporarily unavailable'
        });
    }
}
