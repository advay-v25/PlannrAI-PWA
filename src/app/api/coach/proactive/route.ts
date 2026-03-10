import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { checkProactiveTriggers } from '@/lib/coach/proactive-checker';

export async function GET(request: NextRequest) {
    try {
        const cookieStore = await cookies();
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    get(name: string) {
                        return cookieStore.get(name)?.value;
                    },
                },
            }
        );

        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const { data: canShow } = await supabase.rpc('can_show_proactive_suggestion', {
            p_user_id: user.id
        });

        if (canShow === false) { // Assuming RPC returns a boolean, we handle false explicit
            return NextResponse.json({
                success: true,
                has_suggestion: false,
                reason: 'Daily limit reached',
            });
        }

        const suggestion = await checkProactiveTriggers(user.id, supabase);

        if (!suggestion) {
            return NextResponse.json({
                success: true,
                has_suggestion: false,
            });
        }

        await supabase.from('coach_proactive_log').insert({
            user_id: user.id,
            trigger_type: suggestion.trigger_type,
            trigger_data: suggestion.trigger_data,
            shown_at: new Date().toISOString(),
        });

        return NextResponse.json({
            success: true,
            has_suggestion: true,
            suggestion: {
                id: suggestion.id,
                trigger_type: suggestion.trigger_type,
                title: suggestion.title,
                message: suggestion.message,
                action_label: suggestion.action_label,
                priority: suggestion.priority,
            },
        });

    } catch (error) {
        console.error('[Coach Proactive] Error:', error);

        return NextResponse.json({
            success: false,
            error: 'Failed to check proactive suggestions',
        }, { status: 500 });
    }
}
