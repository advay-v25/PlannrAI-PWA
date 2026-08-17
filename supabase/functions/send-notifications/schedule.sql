-- Minute-level scheduler for send-notifications.
--
-- Kept OUT of supabase/migrations/ on purpose: it embeds the service-role key
-- in a cron command, and migrations are committed to git. Run this once by hand
-- in the Supabase SQL Editor (Dashboard → SQL Editor), substituting the two
-- placeholders. The key is then stored in cron.job, readable only by the
-- postgres role.
--
-- Vercel Cron cannot drive this: the Hobby plan runs cron at most once per day,
-- and a 5-minute-lead alert needs a minute-level ticker.

-- 1. Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;

-- 2. Replace any previous version of the job so re-running is safe ───────────
SELECT cron.unschedule('send-notifications-every-minute')
WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'send-notifications-every-minute'
);

-- 3. Schedule ────────────────────────────────────────────────────────────────
--    <PROJECT_REF>       → your Supabase project ref
--    <SERVICE_ROLE_KEY>  → Settings → API → service_role key
SELECT cron.schedule(
    'send-notifications-every-minute',
    '* * * * *',
    $$
    SELECT net.http_post(
        url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-notifications',
        headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
        ),
        body        := '{}'::jsonb,
        timeout_milliseconds := 30000
    );
    $$
);

-- 4. Verify ──────────────────────────────────────────────────────────────────
-- Job is registered:
--   SELECT jobid, jobname, schedule, active FROM cron.job
--    WHERE jobname = 'send-notifications-every-minute';
--
-- Recent runs succeeded:
--   SELECT status, return_message, start_time
--     FROM cron.job_run_details
--    WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'send-notifications-every-minute')
--    ORDER BY start_time DESC LIMIT 10;
--
-- HTTP responses from the function (200 = ran; body shows sent/failed/pruned):
--   SELECT id, status_code, content, created
--     FROM net._http_response ORDER BY created DESC LIMIT 10;

-- To stop it:
--   SELECT cron.unschedule('send-notifications-every-minute');
