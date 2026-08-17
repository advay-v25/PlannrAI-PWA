-- Web Push notifications: subscriptions, send log, and the lead-time preference.
--
-- Delivery is driven by pg_cron + pg_net calling the `send-notifications`
-- Edge Function once a minute (see the bottom of this file). The Edge Function
-- talks to these tables with the service role; the app itself only ever touches
-- the current user's own rows via RLS.
--
-- Everything here is IF NOT EXISTS / idempotent so re-running is safe.

-- ── Subscriptions ────────────────────────────────────────────────────────────
-- One row per browser/PWA install. `endpoint` is the push service URL and is
-- globally unique, which makes it the natural upsert key: iOS hands out a fresh
-- endpoint whenever a PWA is removed and re-added, so a user legitimately has
-- several rows over time and we prune dead ones on 404/410 at send time.

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint    TEXT NOT NULL UNIQUE,
    p256dh      TEXT NOT NULL,
    auth        TEXT NOT NULL,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
    ON push_subscriptions (user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'push_subscriptions' AND policyname = 'push_subscriptions_own_rows'
    ) THEN
        CREATE POLICY push_subscriptions_own_rows ON push_subscriptions
            FOR ALL
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;

-- ── Send log ─────────────────────────────────────────────────────────────────
-- The idempotency ledger. The cron ticks every minute and the trigger windows
-- are wider than a minute, so without this a user would get the same alert
-- several times. `ref_id` is the block id for block_start and a YYYY-MM-DD date
-- key for due_digest, which is what makes the digest strictly once-per-day.

CREATE TABLE IF NOT EXISTS notification_log (
    id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    ref_id   TEXT NOT NULL,
    kind     TEXT NOT NULL CHECK (kind IN ('block_start', 'due_digest')),
    sent_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_log_dedupe
    ON notification_log (user_id, ref_id, kind);

CREATE INDEX IF NOT EXISTS idx_notification_log_sent_at
    ON notification_log (sent_at);

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'notification_log' AND policyname = 'notification_log_own_rows'
    ) THEN
        CREATE POLICY notification_log_own_rows ON notification_log
            FOR SELECT
            USING (auth.uid() = user_id);
    END IF;
END $$;

-- ── Lead time preference ─────────────────────────────────────────────────────
-- How many minutes before a block starts the alert fires. The digest has no
-- column: its time is derived from wake_time + morning_routine_min, the same
-- "day actually starts here" value the day generator uses.

ALTER TABLE profile_preferences
    ADD COLUMN IF NOT EXISTS notification_lead_mins INTEGER NOT NULL DEFAULT 5;
