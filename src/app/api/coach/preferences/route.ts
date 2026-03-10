import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

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

        const { data: preferences } = await supabase
            .from('coach_learned_preferences')
            .select('*')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        return NextResponse.json({
            success: true,
            preferences: preferences || [],
        });

    } catch (error) {
        console.error('[Coach Preferences GET] Error:', error);

        return NextResponse.json({
            success: false,
            error: 'Failed to fetch preferences',
        }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
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

        const body = await request.json();
        const { category, preference_key, preference_value, natural_language, conversation_id, message_id } = body;

        if (!category || !preference_key || !preference_value || !natural_language) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields' },
                { status: 400 }
            );
        }

        const { data, error } = await supabase
            .from('coach_learned_preferences')
            .upsert({
                user_id: user.id,
                category,
                preference_key,
                preference_value,
                natural_language,
                learned_from_conversation_id: conversation_id || null,
                learned_from_message_id: message_id || null,
                learned_at: new Date().toISOString(),
                user_confirmed: true,
                is_active: true,
                updated_at: new Date().toISOString(),
            }, {
                onConflict: 'user_id,preference_key',
            })
            .select()
            .single();

        if (error) {
            console.error('Failed to save preference:', error);
            return NextResponse.json(
                { success: false, error: 'Failed to save preference' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            preference: data,
        });

    } catch (error) {
        console.error('[Coach Preferences POST] Error:', error);

        return NextResponse.json({
            success: false,
            error: 'Failed to save preference',
        }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
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

        const { searchParams } = new URL(request.url);
        const preferenceId = searchParams.get('id');

        if (!preferenceId) {
            return NextResponse.json(
                { success: false, error: 'Preference ID is required' },
                { status: 400 }
            );
        }

        await supabase
            .from('coach_learned_preferences')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('id', preferenceId)
            .eq('user_id', user.id);

        return NextResponse.json({
            success: true,
            message: 'Preference removed',
        });

    } catch (error) {
        console.error('[Coach Preferences DELETE] Error:', error);

        return NextResponse.json({
            success: false,
            error: 'Failed to remove preference',
        }, { status: 500 });
    }
}
