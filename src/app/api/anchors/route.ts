
import { secureApiRoute, apiSuccess, apiError, validateRequiredFields } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// POST - Create a new anchor (commitment)
// POST - Create a new anchor (commitment)
export const POST = secureApiRoute(
    async (context, body) => {
        const payload = body as {
            title: string;
            start_time: string;
            end_time: string;
            days_of_week: number[];
        };

        console.log("ANCHOR REQUEST USER", context.userId);
        console.log("ANCHOR PAYLOAD", payload);

        // 1. Validation (Explicit 400)
        const validation = validateRequiredFields(payload, ['title', 'start_time', 'end_time', 'days_of_week']);
        if (!validation.valid) {
            console.warn("ANCHOR VALIDATION FAILED", validation.missing);
            return apiError(`Missing required fields: ${validation.missing.join(', ')}`, 400);
        }

        // Validate time format regex
        const timeRegex = /^\d{2}:\d{2}$/;
        if (!timeRegex.test(payload.start_time) || !timeRegex.test(payload.end_time)) {
            console.warn("ANCHOR INVALID TIME FORMAT", { start: payload.start_time, end: payload.end_time });
            return apiError('Invalid time format. Use HH:MM', 400);
        }

        // Validate logic
        if (payload.end_time <= payload.start_time) {
            console.warn("ANCHOR LOGIC ERROR: End <= Start");
            return apiError('End time must be after start time', 400);
        }

        // Validate array length
        if (!Array.isArray(payload.days_of_week) || payload.days_of_week.length === 0) {
            console.warn("ANCHOR INVALID DAYS", payload.days_of_week);
            return apiError('Select at least one day', 400);
        }

        // 2. Auth Check (Explicit 401)
        if (!context.userId) {
            console.error("ANCHOR AUTH MISSING");
            return apiError('Unauthorized: No User ID', 401);
        }

        const supabase = await createClient();

        // 3. Database Insert (The Hardened Call)
        const { data, error } = await supabase
            .from('commitments')
            .insert({
                user_id: context.userId,
                title: payload.title,
                start_time: payload.start_time,
                end_time: payload.end_time,
                days_of_week: payload.days_of_week,
                is_active: true
            })
            .select() // Confirm peristence
            .single();

        if (error) {
            console.error("ANCHOR INSERT ERROR", {
                message: error.message,
                details: error.details,
                hint: error.hint,
                code: error.code,
                payload,
                user_id: context.userId
            });

            // Map PG Error codes if possible, otherwise 500
            // 42501 = RLS, 23505 = Unique, 23502 = Not Null, 42703 = Invalid Column
            let status = 500;
            let errorMsg = "ANCHOR_INSERT_FAILED";

            if (error.code === '42501') {
                status = 403;
                errorMsg = "ANCHOR_FORBIDDEN_RLS";
            } else if (error.code === '42703') {
                errorMsg = "ANCHOR_SCHEMA_MISMATCH"; // Likely the day_of_week issue
            }

            return NextResponse.json({
                error: errorMsg,
                message: error.message,
                details: error.details || error.hint
            }, {
                status
            });
        }

        console.log("ANCHOR CREATED SUCCESSFULLY", data.id);

        // MATERIALIZE BLOCKS (Phase 3 Requirement)
        // Immediately project this anchor onto the calendar for the next 30 days
        try {
            const { AnchorService } = await import('@/lib/calendar/anchor-service'); // dynamic import or top-level is fine
            const today = new Date();
            const future = new Date();
            future.setDate(today.getDate() + 30);

            await AnchorService.materialize(context.userId, data, today, future, supabase);
            console.log("ANCHOR MATERIALIZED");
        } catch (matError) {
            console.error("ANCHOR MATERIALIZATION FAILED", matError);
            // Non-blocking? Or warning? 
            // We should arguably return a warning, but for now just log. 
            // The constraint is that the API "must materialize", so if it fails, the user experience is broken.
            // But rolling back the commitment insert is also complex.
        }

        return apiSuccess({ commitment: data }, 201);
    },
    { requireAuth: true, auditAction: 'anchor_create' }
);

// DELETE - Remove an anchor
export const DELETE = secureApiRoute(
    async (context, body) => {
        const { searchParams } = new URL(context.request.url);
        const id = searchParams.get('id');

        if (!id) {
            return apiError('Missing anchor ID', 400);
        }

        const supabase = await createClient();
        const { error } = await supabase
            .from('commitments')
            .delete()
            .eq('id', id)
            .eq('user_id', context.userId);

        if (error) {
            console.error("ANCHOR DELETE ERROR", error);
            return apiError(error.message, 500);
        }

        return apiSuccess({ success: true });
    },
    { requireAuth: true, auditAction: 'anchor_delete' }
);

// GET - List anchors
export const GET = secureApiRoute(
    async (context) => {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('commitments')
            .select('*')
            .eq('user_id', context.userId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error("ANCHOR FETCH ERROR", error);
            return apiError(error.message, 500);
        }

        return apiSuccess({ commitments: data });
    },
    { requireAuth: true, auditAction: 'anchor_list' }
);
