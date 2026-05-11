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

        // Check proactive trigger: look at today's schedule for anomalies
        const today = new Date().toISOString().split('T')[0];
        const now = new Date();
        const currentHour = now.getHours();

        const { data: todayBlocks } = await supabase
            .from('schedule_blocks')
            .select('id, title, status, start_time, end_time, block_type')
            .eq('user_id', user.id)
            .eq('date', today);

        const blocks = todayBlocks || [];
        const missedBlocks = blocks.filter((b: any) => {
            if (b.status !== 'planned') return false;
            const endHour = parseInt((b.end_time || '00:00').split(':')[0]);
            return endHour < currentHour;
        });

        const completedBlocks = blocks.filter((b: any) => b.status === 'completed');

        // Check for needs_rescheduling flag in profile
        const { data: profile } = await supabase.from('profiles').select('bio_data').eq('id', user.id).single();
        const bioData = (profile?.bio_data as any) || {};
        const needsRescheduling = bioData.needs_rescheduling === true;
        const pendingGoal = bioData.pending_goal_update || 'your new goal';

        // Generate a proactive suggestion based on schedule state
        let suggestion = null;

        if (needsRescheduling) {
            suggestion = {
                id: 'goal-sync-needed',
                trigger_type: 'goal_added',
                title: 'Schedule Optimization Required',
                message: `I noticed you updated "${pendingGoal}". Should I re-optimize your week to fit it in?`,
                action_label: 'Optimize Schedule',
                priority: 'high',
            };
            
            // Note: Flag is now cleared only upon user action (dismiss/apply)

        } else if (missedBlocks.length >= 3) {
            suggestion = {
                id: 'missed-blocks',
                trigger_type: 'missed_blocks',
                title: `${missedBlocks.length} blocks missed today`,
                message: `You've missed ${missedBlocks.length} scheduled blocks today. Want me to help you adapt the rest of your day?`,
                action_label: 'Adjust Day',
                priority: 'high',
            };
        } else if (blocks.length === 0 && currentHour >= 8) {
            suggestion = {
                id: 'no-schedule',
                trigger_type: 'empty_day',
                title: 'No schedule for today',
                message: 'Your day is unplanned. Want me to build a schedule based on your goals?',
                action_label: 'Plan Today',
                priority: 'medium',
            };
        } else if (completedBlocks.length > 0 && completedBlocks.length === blocks.length) {
            suggestion = {
                id: 'all-done',
                trigger_type: 'all_complete',
                title: 'You\'ve completed everything!',
                message: 'You\'ve finished all your planned blocks. Want to add something productive to the rest of your day?',
                action_label: 'Add More',
                priority: 'low',
            };
        }

        if (!suggestion) {
            return NextResponse.json({
                success: true,
                has_suggestion: false,
            });
        }

        return NextResponse.json({
            success: true,
            has_suggestion: true,
            suggestion,
        });

    } catch (error) {
        console.error('[Coach Proactive] Error:', error);
        // Always return success with no suggestion on error — never 500 to the user
        return NextResponse.json({
            success: true,
            has_suggestion: false,
        });
    }
}
