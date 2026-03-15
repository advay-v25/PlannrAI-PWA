import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { PatchService } from '@/lib/services/patch-service';


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
        const { undo_token } = body;

        if (!undo_token) {
            return NextResponse.json(
                { success: false, error: 'undo_token is required' },
                { status: 400 }
            );
        }

        const result = await PatchService.undoPatch(user.id, undo_token, supabase);

        if (!result.success) {
            return NextResponse.json({
                success: false,
                error: 'Undo failed',
            }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            message: 'Changes undone successfully',
        });


    } catch (error) {
        console.error('[Coach Undo] Error:', error);

        return NextResponse.json({
            success: false,
            error: 'Failed to undo changes',
        }, { status: 500 });
    }
}
