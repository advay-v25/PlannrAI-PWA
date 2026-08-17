/**
 * send-notifications — invoked once a minute by pg_cron + pg_net.
 *
 * Two jobs per run:
 *   A. Block alerts     — `lead_mins` (default 5) before a goal/anchor block starts.
 *   B. Mindspace digest — one per day, at the user's wake_time + morning_routine_min.
 *
 * Both are evaluated in each user's OWN timezone. Blocks store a date plus local
 * 'HH:MM' strings with no offset, so comparing them against UTC would hand a
 * user in another timezone 3am alerts. Every comparison goes through
 * getLocalNow(profile.timezone).
 *
 * Duplicate suppression lives in `notification_log`: the trigger windows are
 * wider than one minute (so a delayed or dropped cron tick still delivers), and
 * the unique index on (user_id, ref_id, kind) is what keeps that from sending
 * the same alert twice.
 *
 * Decision logic lives in ./logic.ts so it can be tested without I/O.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.93.2';
import { sendPush, type PushTarget, type VapidKeys } from './webpush.ts';
import {
    NOTIFIABLE_BLOCK_TYPES,
    composeBlockAlert,
    composeDigestBody,
    digestTriggerMinutes,
    getLocalNow,
    inWindow,
    isArchived,
    shouldAlertBlock,
} from './logic.ts';

interface PendingNotification {
    userId: string;
    refId: string;
    kind: 'block_start' | 'due_digest';
    title: string;
    body: string;
    url: string;
}

Deno.serve(async (_req: Request) => {
    const startedAt = Date.now();

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const vapidPublic = Deno.env.get('NEXT_PUBLIC_VAPID_PUBLIC_KEY') ?? Deno.env.get('VAPID_PUBLIC_KEY');
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY');
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:aaravaher25@gmail.com';

    // Never crash the cron: report the missing piece by name (never the value).
    const missing = [
        !supabaseUrl && 'SUPABASE_URL',
        !serviceRoleKey && 'SUPABASE_SERVICE_ROLE_KEY',
        !vapidPublic && 'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
        !vapidPrivate && 'VAPID_PRIVATE_KEY',
    ].filter(Boolean);
    if (missing.length) {
        console.error('[send-notifications] missing env:', missing.join(', '));
        return Response.json({ ok: false, error: 'missing_env', missing }, { status: 500 });
    }

    const vapidKeys: VapidKeys = {
        publicKey: vapidPublic!,
        privateKey: vapidPrivate!,
        subject: vapidSubject,
    };

    const supabase = createClient(supabaseUrl!, serviceRoleKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    const now = new Date();

    try {
        // ── Candidate users: anyone with at least one live subscription ──────
        const { data: subscriptions, error: subError } = await supabase
            .from('push_subscriptions')
            .select('id, user_id, endpoint, p256dh, auth');
        if (subError) throw subError;

        if (!subscriptions?.length) {
            return Response.json({ ok: true, sent: 0, reason: 'no_subscriptions' });
        }

        const userIds = [...new Set(subscriptions.map(s => s.user_id))];

        // notifications_enabled = false means the user receives nothing, so the
        // filter belongs here, before any work is done on their behalf.
        const { data: prefs, error: prefError } = await supabase
            .from('profile_preferences')
            .select('user_id, notifications_enabled, notification_lead_mins, wake_time, morning_routine_min')
            .in('user_id', userIds)
            .eq('notifications_enabled', true);
        if (prefError) throw prefError;

        const activeUserIds = (prefs ?? []).map(p => p.user_id);
        if (!activeUserIds.length) {
            return Response.json({ ok: true, sent: 0, reason: 'no_enabled_users' });
        }

        const { data: profiles, error: profileError } = await supabase
            .from('profiles')
            .select('id, timezone')
            .in('id', activeUserIds);
        if (profileError) throw profileError;

        const timezoneByUser = new Map<string, string | null>(
            (profiles ?? []).map(p => [p.id, p.timezone])
        );

        // Local "today" differs per user, so pull the UTC-adjacent dates once
        // and let each user pick their own out of the result.
        const candidateDates = [...new Set(
            [-1, 0, 1].map(offset =>
                new Date(now.getTime() + offset * 86400000).toISOString().slice(0, 10)
            )
        )];

        const [blocksResult, todosResult, logResult] = await Promise.all([
            supabase
                .from('schedule_blocks')
                .select('id, user_id, title, block_type, start_time, end_time, date, status')
                .in('user_id', activeUserIds)
                .in('date', candidateDates)
                .in('block_type', NOTIFIABLE_BLOCK_TYPES),
            supabase
                .from('todos')
                .select('id, user_id, title, description, due_date, is_completed')
                .in('user_id', activeUserIds)
                .in('due_date', candidateDates)
                .eq('is_completed', false),
            supabase
                .from('notification_log')
                .select('user_id, ref_id, kind')
                .in('user_id', activeUserIds)
                .gte('sent_at', new Date(now.getTime() - 3 * 86400000).toISOString()),
        ]);

        if (blocksResult.error) throw blocksResult.error;
        if (todosResult.error) throw todosResult.error;
        if (logResult.error) throw logResult.error;

        const alreadySent = new Set(
            (logResult.data ?? []).map(l => `${l.user_id}|${l.ref_id}|${l.kind}`)
        );

        const pending: PendingNotification[] = [];

        for (const pref of prefs ?? []) {
            const userId = pref.user_id;
            const local = getLocalNow(timezoneByUser.get(userId), now);

            // ── Job A: block alerts ──────────────────────────────────────────
            const leadMins = typeof pref.notification_lead_mins === 'number'
                ? pref.notification_lead_mins
                : 5;

            const userBlocks = (blocksResult.data ?? []).filter(
                b => b.user_id === userId && b.date === local.date
            );

            for (const block of userBlocks) {
                if (!shouldAlertBlock(block, local.minutes, leadMins)) continue;
                if (alreadySent.has(`${userId}|${block.id}|block_start`)) continue;

                const { title, body } = composeBlockAlert(block);
                pending.push({
                    userId, refId: block.id, kind: 'block_start',
                    title, body, url: '/app/calendar',
                });
            }

            // ── Job B: Mindspace due digest ──────────────────────────────────
            const digestMinutes = digestTriggerMinutes(pref.wake_time, pref.morning_routine_min);
            if (digestMinutes === null) continue;
            if (!inWindow(local.minutes, digestMinutes)) continue;

            const digestRef = `digest:${local.date}`;
            if (alreadySent.has(`${userId}|${digestRef}|due_digest`)) continue;

            const dueToday = (todosResult.data ?? []).filter(
                t => t.user_id === userId && t.due_date === local.date && !isArchived(t.description)
            );

            // Nothing due → send nothing at all. Never a "0 items" notification.
            const body = composeDigestBody(dueToday);
            if (!body) continue;

            pending.push({
                userId, refId: digestRef, kind: 'due_digest',
                title: 'Mindspace', body, url: '/app/tasks',
            });
        }

        if (!pending.length) {
            return Response.json({ ok: true, sent: 0, ms: Date.now() - startedAt });
        }

        // ── Deliver ──────────────────────────────────────────────────────────
        const subsByUser = new Map<string, typeof subscriptions>();
        for (const sub of subscriptions) {
            const list = subsByUser.get(sub.user_id) ?? [];
            list.push(sub);
            subsByUser.set(sub.user_id, list);
        }

        const deadSubscriptionIds: string[] = [];
        let sent = 0;
        let failed = 0;

        for (const notification of pending) {
            const targets = subsByUser.get(notification.userId) ?? [];
            if (!targets.length) continue;

            const payload = {
                title: notification.title,
                body: notification.body,
                url: notification.url,
            };

            const results = await Promise.all(targets.map(async target => {
                const result = await sendPush(
                    { endpoint: target.endpoint, p256dh: target.p256dh, auth: target.auth } as PushTarget,
                    payload,
                    vapidKeys
                );
                if (result.gone) {
                    deadSubscriptionIds.push(target.id);
                } else if (!result.ok) {
                    // Deliberately not logged to notification_log: with no row,
                    // the next tick retries this inside the same window.
                    console.error(
                        `[send-notifications] push failed user=${notification.userId} ` +
                        `kind=${notification.kind} status=${result.status} ${result.error ?? ''}`
                    );
                }
                return result;
            }));

            // One log row per notification once any device took it. Logging on
            // partial success is intentional: the alert reached the user, and a
            // retry would re-notify every device that already got it.
            if (results.some(r => r.ok)) {
                const { error: logError } = await supabase.from('notification_log').insert({
                    user_id: notification.userId,
                    ref_id: notification.refId,
                    kind: notification.kind,
                });
                // 23505 = another tick won the race; that is the index doing its job.
                if (logError && logError.code !== '23505') {
                    console.error('[send-notifications] log insert failed:', logError.message);
                }
                sent++;
            } else {
                failed++;
            }
        }

        // Prune endpoints the push service says are permanently gone (deleted
        // PWA, reinstalled app) — otherwise dead iOS rows accumulate forever.
        if (deadSubscriptionIds.length) {
            const { error: deleteError } = await supabase
                .from('push_subscriptions')
                .delete()
                .in('id', [...new Set(deadSubscriptionIds)]);
            if (deleteError) console.error('[send-notifications] prune failed:', deleteError.message);
        }

        return Response.json({
            ok: true,
            sent,
            failed,
            pruned: new Set(deadSubscriptionIds).size,
            ms: Date.now() - startedAt,
        });
    } catch (err) {
        console.error('[send-notifications] run failed:', err);
        return Response.json({ ok: false, error: String(err) }, { status: 500 });
    }
});
