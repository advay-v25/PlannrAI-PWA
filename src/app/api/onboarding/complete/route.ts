import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@supabase/supabase-js';

export const POST = secureApiRoute(
    async (context, body) => {
        const {
            full_name, timezone,
            sleep_start, sleep_end, wind_down_mins, morning_routine_mins,
            meals_per_day, meal_timing, default_buffer_duration,
            two_meals_selection, custom_meal_times,
            commitments, goals, failure_modes,
            selected_variant_id
        } = body as any;

        const addMinsToTime = (timeStr: string, mins: number) => {
            if (!timeStr) return '';
            const [h, m] = timeStr.split(':').map(Number);
            const totalMins = h * 60 + m + mins;
            const newH = Math.floor(totalMins / 60) % 24;
            const newM = totalMins % 60;
            return `${newH.toString().padStart(2, '0')}:${newM.toString().padStart(2, '0')}`;
        };

        // Basic validation
        if (!full_name || !sleep_start || !sleep_end) {
            return apiError('Identity and sleep times are required');
        }

        let supabase = context.supabase;
        const userId = context.userId;

        // Use Service Role in development if auth context is missing (for local testing)
        if (process.env.NODE_ENV === 'development' && !userId) {
            supabase = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_ROLE_KEY!
            );
        }

        const effectiveUserId = userId;
        if (!effectiveUserId) {
             return apiError('User ID not found in session', 401);
        }
        console.log(`[API] Completing Onboarding for ${effectiveUserId}`);

        // 1. Update Profile (Identity + Rhythm + Failure Modes)
        const { error: profileError } = await supabase
            .from('profiles')
            .upsert({
                id: effectiveUserId,
                full_name,
                timezone,
                sleep_start,
                sleep_end,
                wind_down_mins,
                morning_routine_mins: morning_routine_mins || 0,
                meals_per_day,
                // failure_modes and other rhythm metadata stored in bio_data
                bio_data: {
                    failure_modes: failure_modes || [],
                    meal_timing: meal_timing || 'normal',
                    default_buffer_duration: default_buffer_duration || 10,
                    initialized_at: new Date().toISOString()
                },
                onboarding_complete: true,
                updated_at: new Date().toISOString()
            });

        if (profileError) {
            console.error('Profile update failed:', profileError);
            throw new Error(`Profile update failed: ${profileError.message}`);
        }

        let safeBufferMin = default_buffer_duration || 10;
        if (![5, 10, 15].includes(safeBufferMin)) safeBufferMin = 15;

        // Build explicit meal windows based on UI selections
        const meal_windows: Record<string, any> = {};
        const isTwoMeals = meals_per_day === 2;
        
        if (!isTwoMeals || (isTwoMeals && two_meals_selection?.includes('breakfast'))) {
            meal_windows.breakfast = {
                start: custom_meal_times?.breakfast || '08:00',
                end: custom_meal_times?.breakfast ? addMinsToTime(custom_meal_times.breakfast, 30) : '08:30'
            };
        }
        if (!isTwoMeals || (isTwoMeals && two_meals_selection?.includes('lunch'))) {
            meal_windows.lunch = {
                start: custom_meal_times?.lunch || '13:00',
                end: custom_meal_times?.lunch ? addMinsToTime(custom_meal_times.lunch, 45) : '13:45'
            };
        }
        if (!isTwoMeals || (isTwoMeals && two_meals_selection?.includes('dinner'))) {
            meal_windows.dinner = {
                start: custom_meal_times?.dinner || '19:00',
                end: custom_meal_times?.dinner ? addMinsToTime(custom_meal_times.dinner, 45) : '19:45'
            };
        }

        // 1.5 Update Profile Preferences
        const { error: prefError } = await supabase
            .from('profile_preferences')
            .upsert({
                user_id: effectiveUserId,
                sleep_start,
                wake_time: sleep_end,
                wind_down_min: wind_down_mins,
                morning_routine_min: morning_routine_mins || 0,
                meals_per_day,
                meal_windows,
                buffer_min: safeBufferMin,
                updated_at: new Date().toISOString()
            });

        if (prefError) {
            console.error('Profile preferences update failed:', prefError);
        }

        // 2. Insert Commitments (Anchors)
        if (commitments && commitments.length > 0) {
            const { error: commitmentsError, data: insertedComms } = await supabase
                .from('commitments')
                .insert(commitments.map((c: any) => ({
                    user_id: effectiveUserId,
                    title: c.title,
                    start_time: c.start_time,
                    end_time: c.end_time,
                    days_of_week: c.days_of_week,
                    is_active: true
                })))
                .select();

            if (commitmentsError) {
                console.error('Commitments insert failed:', commitmentsError);
            } else if (insertedComms) {
                try {
                    const { AnchorService } = await import('@/lib/calendar/anchor-service');
                    // Materialize for the next 21 days so the initial week generation sees them
                    const startDate = new Date();
                    const endDate = new Date(startDate);
                    endDate.setDate(endDate.getDate() + 21);
                    
                    for (const comm of insertedComms) {
                        await AnchorService.materialize(effectiveUserId, comm, startDate, endDate, supabase as any);
                    }
                    console.log(`Materialized ${insertedComms.length} commitments for user ${effectiveUserId}`);
                } catch (matError) {
                    console.error('Failed to materialize commitments:', matError);
                }
            }
        }

        // 3. Insert Goals
        if (goals && goals.length > 0) {
            const { error: goalsError } = await supabase
                .from('goals')
                .insert(goals.map((g: any) => ({
                    user_id: effectiveUserId,
                    title: g.title,
                    pillar: g.pillar,
                    category: g.pillar, // sync for legacy
                    importance: g.importance || 'high',
                    days_per_week: g.days_per_week || 7,
                    minutes_per_day: g.target_minutes_per_day,
                    energy_demand: g.energy_demand || 'medium',
                    weekly_target_minutes: g.target_minutes_per_day * (g.days_per_week || 7),
                    status: 'active'
                })));

            if (goalsError) {
                console.error('Goals insert failed:', goalsError);
            }
        }

        // 4. Trigger Initial Schedule Generation
        const { buildCalendarContext } = await import('@/lib/calendar/context-builder');
        const { generateWeekPlan } = await import('@/lib/calendar/ai/plan-week');
        const { PatchService } = await import('@/lib/services/patch-service');
        
        const today = new Date().toISOString().split('T')[0];
        let blocksCreated = 0;

        try {
            const calendarCtx = await buildCalendarContext(effectiveUserId, supabase as any);
            
            // Map selected variant to generation mode
            const modeMap: Record<string, 'balanced' | 'momentum' | 'recovery'> = {
                balanced: 'balanced',
                intense: 'momentum',
                recovery: 'recovery',
            };
            const genMode = modeMap[selected_variant_id || 'balanced'] || 'balanced';
            
            const variants = await generateWeekPlan(calendarCtx, today, genMode, true);

            if (variants.length > 0) {
                const bestVariant = variants[0]; // Take standard balanced variant
                
                const calendarPatch = {
                    ops: bestVariant.blocks.map((b: any) => ({
                        op: 'create_event' as const,
                        payload: {
                            date: b.date,
                            start_time: b.start_time,
                            end_time: b.end_time,
                            title: b.title,
                            block_type: b.block_type,
                            goal_id: b.goal_id || null,
                            pillar: b.pillar || null,
                            status: 'planned',
                            checklist: b.checklist || null,
                        }
                    })),
                    scope: 'week' as const,
                    reason: 'Onboarding initial schedule generation',
                };

                const patchResult = await PatchService.applyPatch(effectiveUserId, calendarPatch as any, supabase as any, 'coach');
                if (!patchResult.success) {
                    console.error('Initial schedule patch failed:', patchResult.errors);
                }
                blocksCreated = bestVariant.blocks.length;
            }
        } catch (genError) {
            console.error('Initial schedule generation failed:', genError);
            // Non-blocking: user is still "onboarded" even if generation fails
        }

        return apiSuccess({
            success: true,
            message: 'Onboarding completed successfully',
            blocksCreated
        });
    },
    { requireAuth: process.env.NODE_ENV !== 'development', auditAction: 'onboarding_complete' }
);
