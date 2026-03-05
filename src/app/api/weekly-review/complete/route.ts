import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { week_start, reality, lever, personal_rules } = body;

        // 1. Save Final Review
        const { data: review, error: reviewError } = await supabase
            .from('weekly_reviews')
            .insert({
                user_id: user.id,
                week_start,
                week_end: week_start, // Same as start if not provided
                ai_patterns: reality ? JSON.stringify({ reality }) : null,
                lever_action: lever,
                completed_at: new Date().toISOString()
            })
            .select()
            .single();

        if (reviewError) throw reviewError;

        // 2. Save Personal Rules if any
        if (personal_rules && Array.isArray(personal_rules)) {
            const rulesToSave = personal_rules.map(rule => ({
                user_id: user.id,
                rule: rule.text || rule.rule_text || rule.rule,
                category: rule.category || 'productivity',
                is_active: true,
                source_review_id: review.id
            }));
            await supabase.from('personal_rules').insert(rulesToSave);
        }

        return NextResponse.json({ success: true, review_id: review.id });
    } catch (error: any) {
        console.error('Weekly Review Complete Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
