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

        const { data: conversations, error } = await supabase
            .from('coach_conversations')
            .select('id, primary_topic, last_message_at, created_at, status')
            .eq('user_id', user.id)
            .order('last_message_at', { ascending: false })
            .limit(20);

        if (error) {
            console.error('[Coach Conversations] DB Error:', error);
            throw error;
        }

        return NextResponse.json({
            success: true,
            conversations: conversations || [],
        });

    } catch (error) {
        console.error('[Coach Conversations] Error:', error);

        return NextResponse.json({
            success: false,
            error: 'Failed to fetch conversations',
        }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json(
                { success: false, error: 'Missing conversation ID' },
                { status: 400 }
            );
        }

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

        // Delete the conversation (will cascade to messages if foreign keys are set up, 
        // otherwise we might need to delete messages first, but let's assume Supabase handles cascade)
        const { error } = await supabase
            .from('coach_conversations')
            .delete()
            .eq('id', id)
            .eq('user_id', user.id); // Ensure user owns the conversation

        if (error) {
            console.error('[Coach Conversations] Delete Error:', error);
            throw error;
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('[Coach Conversations] Error deleting:', error);
        return NextResponse.json({
            success: false,
            error: 'Failed to delete conversation',
        }, { status: 500 });
    }
}
