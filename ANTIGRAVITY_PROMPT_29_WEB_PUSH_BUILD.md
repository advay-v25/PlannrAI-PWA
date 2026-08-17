# BUILD PROMPT: Real lock-screen push notifications (block starts + Mindspace due digest)

Build genuine Web Push so notifications arrive **when the app is closed**, on the iOS home-screen PWA. Today none of this works: `public/sw.js` has a `push` listener, but there is no subscription code, no VAPID keys, no sender, and no scheduler — the listener is dead code. The only working notifications are in-app local ones from `notification-scheduler.tsx`, which fire only while the Home page is open.

**Infrastructure decision (fixed — do not substitute):** the project is on Vercel **Hobby**, where Vercel Cron runs at most once per day and therefore cannot drive minute-level alerts. The scheduler must be **Supabase `pg_cron` + `pg_net` → a Supabase Edge Function**. Do not add paid services, Firebase, OneSignal, or any third-party push vendor.

## Product spec (decided — implement exactly)

- **Block alerts:** fire **5 minutes before** a block starts, for `block_type` of `goal` or `anchor` ONLY (never buffers, meals, sleep, wind-down, or routine). Title = block title; body = `09:45 – 10:45` (calendar-app style); tap opens `/app/calendar`.
- **Mindspace due digest:** ONE notification per day, fired at each user's **wake time + morning routine buffer** (their local time) — i.e. the moment their schedulable day begins. Reuse the same `effectiveWakeTime` concept the day generator uses (`wake_time` + `morning_routine_min`); if `morning_routine_min` is missing or 0, fall back to wake time exactly. Body lists items due today with their pillar: `3 items due today — Extra Features (Ideas), Meeting notes (Work), Gym bag (Personal)`. Pillar comes from the existing `[color:x]` description tag (teal→Notes, purple→Ideas, orange→Urgent, blue→Work, pink→Personal). **Send nothing at all when nothing is due** — never a "0 items" notification.
- Both respect `notifications_enabled` (see prompt 28) — false means the user receives nothing.

## What to build

### 1. Environment — already provisioned, read it before you start

**`.env.local` has been updated with the VAPID keys and Supabase credentials. Read it first and use the exact variable names present there. Do not generate new keys, and never print, log, echo, or commit any secret value.**

Confirmed present in `.env.local`:
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — client-side, passed as `applicationServerKey`
- `VAPID_PRIVATE_KEY` — server/Edge Function only, never exposed to the browser
- `SUPABASE_ACCESS_TOKEN` — for Supabase CLI login and `supabase functions deploy`
- `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `DATABASE_URL` — for the Edge Function and migration

**One gap to close:** `VAPID_SUBJECT` is not yet set. The Web Push protocol requires a contact identifier. Add `VAPID_SUBJECT=mailto:aaravaher25@gmail.com` to `.env.local`, Vercel env, and the Supabase Edge Function secrets, and read it from env (fall back to that mailto only if the variable is missing — never fail silently on it).

Set the same variables as Supabase Edge Function secrets (`supabase secrets set …`) since the function runs outside Vercel and cannot read `.env.local`. If any key is absent at runtime, all push code must no-op gracefully — never crash a page or a build.

### 2. Migration (one new file in `supabase/migrations/`)
- `push_subscriptions`: `id`, `user_id` (FK, cascade delete), `endpoint` (unique), `p256dh`, `auth`, `user_agent`, `created_at`. RLS: users may only read/write their own rows; the Edge Function uses the service role.
- `notification_log`: `id`, `user_id`, `ref_id` (block id or a date key for digests), `kind` (`block_start` | `due_digest`), `sent_at`. Unique index on `(user_id, ref_id, kind)` — this is what prevents a minute-ticker from sending duplicates.
- Add to `profile_preferences`: `notification_lead_mins` int default 5. (Digest time is computed from wake + buffer, so no column needed.)
- Use `IF NOT EXISTS` throughout so re-running is safe.

### 3. Client subscription (`src/hooks/use-notifications.ts` + one API route)
- After permission is granted, call `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` and POST the serialized subscription to a new `POST /api/notifications/subscribe`, which upserts on `endpoint`.
- Re-subscribe check on every app launch (iOS invalidates subscriptions when a PWA is removed and re-added) — cheap `getSubscription()` call, only POST when it changed.
- `DELETE /api/notifications/subscribe` removes the current endpoint; call it when the user turns notifications off.
- Keep the existing `sendLocal` helper intact.

### 4. Sender — Supabase Edge Function (`supabase/functions/send-notifications/`)
Deno function, invoked every minute, doing both jobs in one run:

**Timezone correctness is the hard part.** Blocks store a date plus local `HH:MM` strings, and each profile has a `timezone` from onboarding. For every candidate user, evaluate the trigger in **that user's local time** — never in UTC. A user in a different timezone must never receive 3am alerts.

- **Job A (blocks):** for users with `notifications_enabled` and ≥1 subscription, find blocks where date = today (their TZ), `block_type in ('goal','anchor')`, `status not in ('done','missed')`, and start time is within the current minute window at `lead_mins` (default 5) ahead. Skip any with a `notification_log` row.
- **Job B (digest):** for the same user set, when their local time equals wake + morning buffer (within the minute window), collect incomplete, non-archived todos with `due_date` = today (their TZ). Compose the digest, skip if empty, log with a date-based `ref_id` so it can only fire once per day.
- Send via the Web Push protocol with the VAPID keys (a Deno-compatible web-push library, or raw protocol — no vendor SDKs).
- **Delete subscriptions that return `404` or `410 Gone`** — otherwise dead iOS endpoints accumulate forever.
- Write a `notification_log` row per successful send. Failures are logged and retried next tick, never silently swallowed.

### 5. Schedule (in the migration or a documented SQL snippet)
Enable `pg_cron` and `pg_net`, then schedule the function every minute via `net.http_post` with the service-role header. Document the exact SQL in the PR description so the founders can verify it ran.

### 6. Prevent double notifications
With push live, `notification-scheduler.tsx` (which fires locally 2 minutes before) would double-notify alongside the 5-minute push. Gate it: when an active push subscription exists, the in-app scheduler must not fire. Keep it as the fallback for browsers/devices without push support — do not delete it.

## Scope guard

New: one migration, `supabase/functions/send-notifications/`, `src/app/api/notifications/subscribe/route.ts`. Modified: `use-notifications.ts`, `notification-scheduler.tsx` (gating only), and the settings toggle only if it must call the unsubscribe endpoint. **Do not touch** the calendar/coach/generation code, `sw.js`'s existing `push`/`notificationclick` handlers (they're already correct), the manifest, or any unrelated route. `npm run build` passes.

## Verification

1. **End-to-end on a real iOS device with the PWA installed to the home screen**: enable notifications, schedule a goal block ~6 minutes out, lock the phone, **close the app entirely** → notification arrives on the lock screen ~5 minutes before with the block title and `HH:MM – HH:MM`; tapping opens the calendar.
2. Only goal/anchor blocks notify — confirm a meal, buffer, sleep, and wind-down block produce nothing.
3. Digest: set a todo due today, wait for wake + buffer local time → one notification listing item names with correct pillar labels; with nothing due, no notification is sent.
4. No duplicates: leave the app open on Home during a block alert → exactly one notification, not two.
5. `notifications_enabled` off → nothing is sent, for either job.
6. Timezone: a test profile in a different timezone receives alerts at its own local time.
7. Stale-endpoint cleanup: delete the PWA, trigger a send, confirm the `410` subscription row is removed.
8. Report the exact SQL used for `pg_cron`, plus confirmation that the migration was actually applied to the live database (a prior migration sat unapplied for weeks and silently broke a feature — verify, don't assume).
