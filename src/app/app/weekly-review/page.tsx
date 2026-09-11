'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { Loader2, ArrowRight, ArrowLeft, Brain, Zap, Target, Star, AlertTriangle, MessageCircle, X, CheckCircle2, Circle, ArrowDownRight, ChevronLeft, ChevronRight, RefreshCw, CalendarX, Shuffle } from 'lucide-react';
import ProductivityProfile, { type ProfileAnalysis } from '@/components/weekly-review/productivity-profile';
import { DayChain, type ChainResponse } from '@/components/weekly-review/day-chain';
import { ConfirmChangesModal } from '@/components/weekly-review/confirm-changes-modal';
import { ReviewStatePanel, type ServerRefusal } from '@/components/weekly-review/review-state-panel';
import {
    REVIEW_WEEK_NOT_REVIEWABLE,
    REVIEW_WINDOW_CLOSED,
    logReviewWindow,
    mondayOfIso,
    shiftIsoDate,
    type ReviewWindow,
} from '@/lib/weekly-review/window';
import type { WeekReviewInfo } from '@/app/api/weekly-review/status/route';

/** Prompt 38: the same hours, arranged differently. There is nothing else. */
type ChangeType = 'reshape';

interface ProposedChange {
    goal_id: string;
    title: string;
    change_type: ChangeType;
    old_value: string;
    new_value: string;
    /** Carries the principle: a reshape is not a downgrade. Rendered verbatim. */
    headline: string;
    new_minutes_per_day?: number;
    new_days_per_week?: number;
    new_time_of_day?: 'morning' | 'afternoon' | 'evening';
    old_weekly_minutes?: number;
    new_weekly_minutes?: number;
    rationale: string;
    /** Why this goal. Every proposal carries it; see proposals.ts §4. */
    evidence: {
        missed_minutes: number;
        missed_dates: string[];
        completed_minutes: number;
        target_minutes: number;
    };
}

/**
 * A reshape and a cut must not look alike.
 *
 * A user has to be able to tell at a glance whether they are being asked to
 * change the shape of a week or to give something up. Same-total changes are
 * primary-coloured and read as neutral; the one change type that lowers a
 * target is amber and says so on the card.
 */
const CHANGE_STYLES: Record<
    string,
    { label: string; accent: string; chip: string; ring: string; givesUpHours: boolean }
> = {
    // One entry, because there is one change type. Nothing the review proposes
    // can take hours away, so there is no "gives up hours" styling any more.
    reshape: {
        label: 'Reshape',
        accent: 'text-[var(--color-primary-soft)] dark:text-[var(--color-primary)]',
        chip: 'bg-[var(--color-primary)]/10 text-[var(--color-primary-soft)] dark:text-[var(--color-primary)] border-[var(--color-primary)]/30',
        ring: 'border-[var(--color-primary)]/50 shadow-lg shadow-[var(--color-primary)]/10',
        givesUpHours: false,
    },
};

const styleFor = (t: ChangeType | string) => CHANGE_STYLES[t] ?? CHANGE_STYLES.reshape;

/** Mirrors MISSED_FLOOR_MINS in src/lib/chain/proposals.ts. */
const MISSED_FLOOR_MINS = 60;

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const namedDays = (dates: string[]) => {
    const d = dates.map((x) => WEEKDAY[new Date(`${x}T12:00:00Z`).getUTCDay()]).filter(Boolean);
    if (d.length <= 1) return d[0] || '';
    return `${d.slice(0, -1).join(', ')} and ${d[d.length - 1]}`;
};

const formatMins = (m: number) => {
    const v = Math.max(0, Math.round(m));
    const h = Math.floor(v / 60);
    const rem = v % 60;
    if (h === 0) return `${rem}m`;
    return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
};

/** Deterministic half of the page. Comes from a route that cannot fail. */
interface StatsResponse {
    weekStart: string;
    weekEnd: string;
    metrics: {
        plannedMinutes: number;
        completedMinutes: number;
        skippedMinutes: number;
        goalStats: Record<string, any>;
    };
    profile: ProfileAnalysis;
    chain: ChainResponse;
    /** Deterministic — computed from Postgres, never by the AI. */
    proposed_goal_changes: ProposedChange[];
    /** Minutes planned and not done. Drives the §3 floor and the copy. */
    total_missed_minutes?: number;
    /** Facts about the week, computed from Postgres. Never AI-dependent. */
    wins?: string[];
    /** What the scheduler said when asked to place next week. */
    scheduling?: {
        week_start: string;
        dry_run_ok: boolean;
        dry_run_ms: number;
        unplaceable_minutes: number;
        available_hours: number | null;
        targeted_hours: number | null;
        headroom_hours: number | null;
        is_overcommitted: boolean;
    };
}

/** AI half. `available: false` is a normal outcome, never an error. */
interface ProviderError {
    provider: string;
    model: string;
    status: number | null;
    message: string;
}

interface AiResponse {
    available: boolean;
    reason?: string;
    /** True when any provider reported 429 — a longer, self-healing backoff. */
    rate_limited?: boolean;
    /** Dev-only, ordered so the actionable failure leads. */
    provider_errors?: ProviderError[];
    summary: string | null;
    achievements: string[];
    struggles: string[];
}

/** Retry throttling. Five summaries in fifteen seconds exhausted Groq's 8000 TPM. */
const COOLDOWN_MS = 20_000;
const RATE_LIMIT_COOLDOWN_MS = 60_000;

interface ExecuteResponse {
    success: boolean;
    applied_changes: number;
    skipped_changes?: number;
    replanned: boolean;
    /** Why planning didn't happen, when it didn't. */
    plan_error?: string | null;
    plan?: {
        week_start: string;
        week_end: string;
        blocks_created: number;
        blocks_cleared: number;
    } | null;
    undo_token?: string | null;
    idempotent?: boolean;
}

const isDev = process.env.NODE_ENV !== 'production';

/** yyyy-MM-dd maths that never touches the local timezone. */
const shift = shiftIsoDate;

/**
 * Prompt 54 §1: "which Monday is it?" is NOT decided here any more.
 *
 * The old `thisMonday()`/`lastMonday()` used `getUTCDay()` on the browser
 * clock, so an Asia/Kolkata user at Monday 04:00 local was on Sunday and a
 * Los Angeles user at Sunday 17:00 was already on Monday. The page now asks
 * `/api/weekly-review/status`, which resolves the day in `profiles.timezone`,
 * and renders from that answer. Where the two would disagree, the server wins.
 */

/** Shape of /api/weekly-review/status. */
interface StatusResponse {
    window: ReviewWindow;
    onboarding_complete: boolean;
    has_prior_week_data: boolean;
    last_week_reviewed: boolean;
    should_prompt: boolean;
    week: WeekReviewInfo | null;
}

/** The `?week=` deep link, snapped to a Monday. Null when absent or malformed. */
const weekFromUrl = (): string | null => {
    if (typeof window === 'undefined') return null;
    const raw = new URLSearchParams(window.location.search).get('week');
    return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? mondayOfIso(raw) : null;
};

const prettyDate = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, (m || 1) - 1, d || 1)).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
    });
};

export default function WeeklyReviewPage() {
    const router = useRouter();

    // Which week is on screen. The two fetches below both key off this.
    // Null until the server has said which Monday it is (§1) — nothing is
    // fetched for a week the browser clock guessed.
    const [weekStart, setWeekStart] = useState<string | null>(null);
    const weekEnd = weekStart ? shift(weekStart, 6) : '';

    // §1/§5: the server's resolution of "is the review open" and the state of
    // the selected week. Both come from /status; neither is derived locally.
    const [reviewWindow, setReviewWindow] = useState<ReviewWindow | null>(null);
    const [weekInfo, setWeekInfo] = useState<WeekReviewInfo | null>(null);
    // A REVIEW_WINDOW_CLOSED (or week-scope) refusal from generate-report or
    // execute. Once set, the closed state renders from the server's answer.
    const [serverRefusal, setServerRefusal] = useState<ServerRefusal | null>(null);

    // Deterministic data — drives the whole page and its loading state.
    const [stats, setStats] = useState<StatsResponse | null>(null);
    const [statsLoading, setStatsLoading] = useState(true);

    // AI narrative — drives exactly one optional card, with its own state.
    const [ai, setAi] = useState<AiResponse | null>(null);
    const [aiLoading, setAiLoading] = useState(true);

    // One request at a time, a cooldown after every attempt, and a per-week
    // cache — the three ways the provider budget was being burned.
    // The week currently in flight, not merely "something is in flight" — see
    // fetchAi. A boolean here let a request for one week suppress another.
    const aiInFlight = useRef<string | null>(null);
    /** The week actually on screen, so a late response can be discarded. */
    const selectedWeekRef = useRef<string>('');
    const executeInFlight = useRef(false);
    const summaryCache = useRef<Map<string, AiResponse>>(new Map());
    const [cooldownUntil, setCooldownUntil] = useState(0);
    const [now, setNow] = useState(() => Date.now());

    // Tick only while a cooldown is actually running.
    useEffect(() => {
        if (cooldownUntil <= Date.now()) return;
        const id = setInterval(() => setNow(Date.now()), 250);
        return () => clearInterval(id);
    }, [cooldownUntil]);

    const cooldownLeft = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

    const [isExecuting, setIsExecuting] = useState(false);
    // §5: a full week generation can take ~30s. After a few seconds, say what
    // is actually happening so the wait doesn't read as a hang.
    const [isPlanning, setIsPlanning] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('Gathering your weekly data...');

    // UI State
    const [view, setView] = useState<'report' | 'semi-auto' | 'done'>('report');

    // Semi-auto state
    const [approvedChanges, setApprovedChanges] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!statsLoading) return;
        const messages = [
            'Gathering your weekly data...',
            'Analyzing completion rates...',
            'Identifying key struggles...',
            'Generating performance insights...',
            'Finalizing your weekly review...'
        ];
        let i = 0;
        const interval = setInterval(() => {
            i = (i + 1) % messages.length;
            setLoadingMessage(messages[i]);
        }, 2500);
        return () => clearInterval(interval);
    }, [statsLoading]);

    /**
     * The AI summary. Isolated from the dashboard on purpose: this can fail, be
     * slow, or be rate-limited, and none of that may affect anything else.
     */
    const fetchAi = useCallback(async (start: string, end: string, force = false) => {
        // A week already summarised this session costs nothing to revisit.
        const cached = summaryCache.current.get(start);
        if (!force && cached) {
            setAi(cached);
            setAiLoading(false);
            return;
        }

        // Drop a duplicate of the SAME week; never a different one.
        //
        // This guard used to be a bare boolean, so a request for week B was
        // dropped whenever week A's was still in flight — and `ai` kept week A's
        // narrative while `stats` moved to week B. That is how a chip reading
        // "38h Completed" ended up beside a summary describing 38 hours skipped:
        // the two halves of the screen were describing different weeks.
        if (aiInFlight.current === start) {
            console.warn(`[WeeklyReview] Summary for ${start} already in flight; dropping duplicate.`);
            return;
        }

        aiInFlight.current = start;
        // Clear any residual countdown the moment a request actually starts, so
        // the button can never show a stale "Retry in Ns" while one is in
        // flight. A fresh cooldown is set when it settles.
        setCooldownUntil(0);
        setAiLoading(true);
        try {
            const res = await apiClient.post<AiResponse>('/api/weekly-review/generate-report', {
                weekStart: start,
                weekEnd: end,
            });
            // A response that arrives after the user moved on describes a week
            // that is no longer on screen. Cache it, never render it.
            if (res?.available) summaryCache.current.set(start, res);
            if (selectedWeekRef.current !== start) {
                console.warn(`[WeeklyReview] Discarding stale summary for ${start}; showing ${selectedWeekRef.current}.`);
                return;
            }
            setAi(res);
            setCooldownUntil(Date.now() + (res?.rate_limited ? RATE_LIMIT_COOLDOWN_MS : COOLDOWN_MS));
        } catch (err: any) {
            // §5: the server refused because the window is closed (or the week
            // is not last week). That is not a provider failure and must not
            // render as one, nor be retried — show the closed state from the
            // server's own next-open date.
            if (err?.code === REVIEW_WINDOW_CLOSED || err?.code === REVIEW_WEEK_NOT_REVIEWABLE) {
                console.warn(`[WeeklyReview] Server refused summary for ${start}: ${err.code}`, err?.details);
                if (selectedWeekRef.current === start) {
                    setServerRefusal({ code: err.code, next_open_date: err?.details?.next_open_date, message: err?.message });
                    setAi(null);
                }
                return;
            }
            // A missing paragraph is not worth a toast when the dashboard rendered.
            console.warn('[WeeklyReview] AI summary unavailable:', err);
            if (selectedWeekRef.current === start) {
                setAi({ available: false, summary: null, achievements: [], struggles: [] });
            }
            setCooldownUntil(Date.now() + COOLDOWN_MS);
        } finally {
            aiInFlight.current = null;
            setNow(Date.now());
            setAiLoading(false);
        }
    }, []);

    /**
     * Load a week. `/stats` is fired immediately and owns the page's loading
     * state; the AI request is never allowed to gate it.
     *
     * The AI call is skipped entirely for an empty week — there is nothing to
     * summarise, it would certainly fail, and `aiWeeklyReview` only allows
     * three requests a week, so a doomed call is a real cost.
     */
    const loadWeek = useCallback(async (start: string) => {
        const end = shift(start, 6);
        // Recorded before either request goes out, so a summary that arrives
        // after the user has moved on can be identified as stale.
        selectedWeekRef.current = start;
        setStatsLoading(true);
        setAi(null);
        setAiLoading(true);
        setServerRefusal(null);
        setApprovedChanges(new Set());

        // Stats (always allowed) and the week's review state (§4) load in
        // parallel. The AI decision below waits for BOTH, because it is the
        // server's `ai_allowed` — not this page's clock — that decides.
        let loaded: StatsResponse | null = null;
        let status: StatusResponse | null = null;
        const [statsRes, statusRes] = await Promise.allSettled([
            apiClient.get<StatsResponse>(`/api/weekly-review/stats?weekStart=${start}&weekEnd=${end}`),
            apiClient.get<StatusResponse>(`/api/weekly-review/status?weekStart=${start}`),
        ]);
        if (statsRes.status === 'fulfilled') {
            loaded = statsRes.value;
            setStats(loaded);
            // Proposals come from /stats, so they are ready before the AI is —
            // and stay ready even if the AI never arrives.
            setApprovedChanges(new Set((loaded?.proposed_goal_changes || []).map(c => c.goal_id)));
        } else {
            console.error('[WeeklyReview] Stats fetch failed:', statsRes.reason);
            setStats(null);
        }
        if (statusRes.status === 'fulfilled') {
            status = statusRes.value;
            setReviewWindow(status.window);
            setWeekInfo(status.week);
        } else {
            // Without the server's answer the review is treated as CLOSED. A
            // missing status must never open the AI path.
            console.error('[WeeklyReview] Status fetch failed:', statusRes.reason);
            setWeekInfo(null);
        }
        setStatsLoading(false);

        // Prompt 54 §5: the gate in front of the in-flight guard, cooldown and
        // cache. Monday AND last week AND unreviewed — as decided by the server
        // — or fetchAi is not called at all. Not called-and-discarded, not
        // called-and-cached: not called.
        const aiAllowed = status?.week?.ai_allowed === true;
        if (aiAllowed && (loaded?.profile?.data_points ?? 0) > 0) {
            fetchAi(start, end);
        } else {
            setAiLoading(false);
        }
    }, [fetchAi]);

    // §1: resolve "which Monday" from the server ONCE per page load, then log
    // it. Until this settles nothing is fetched — the browser clock is not
    // consulted for the default week.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const deepLink = weekFromUrl();
            try {
                const status = await apiClient.get<StatusResponse>('/api/weekly-review/status');
                if (cancelled) return;
                logReviewWindow('page', status.window);
                setReviewWindow(status.window);
                // §3a: the current week is reachable by deep link only. The
                // picker stops at last week; a `?week=` at or past this Monday
                // is clamped to this Monday, which renders the closed state.
                const wanted = deepLink && deepLink > status.window.this_monday ? status.window.this_monday : deepLink;
                setWeekStart(wanted || status.window.last_monday);
            } catch (err) {
                // The page must still load (§3). Fall back to the deep link or
                // to a locally-guessed last Monday for the STATS only; the AI
                // path stays shut because `weekInfo.ai_allowed` is never set.
                console.error('[WeeklyReview] Status fetch failed on load:', err);
                if (cancelled) return;
                const guess = shift(mondayOfIso(new Date().toISOString().slice(0, 10)), -7);
                setWeekStart(deepLink || guess);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (weekStart) loadWeek(weekStart);
    }, [weekStart, loadWeek]);

    // Nothing is written until this is confirmed. Automatic and Semi-Automated
    // both route through it.
    const [pendingApply, setPendingApply] = useState<{
        mode: 'auto' | 'semi-auto';
        changes: ProposedChange[];
    } | null>(null);

    /**
     * Prompt 54: is the review OPEN for the week on screen? True only when the
     * server said `ai_allowed` (Monday, last week, unreviewed) and has not
     * since refused. Everything actionable — the AI card, the proposals, the
     * three execution buttons — hangs off this one boolean.
     */
    const reviewOpen = weekInfo?.ai_allowed === true && !serverRefusal;

    /** The deterministic proposals. Never sourced from the AI. */
    const proposals: ProposedChange[] = stats?.proposed_goal_changes || [];
    const hasProposals = proposals.length > 0;

    // §3: more than an hour missing across the week is enough to offer help,
    // even when no single goal tripped a per-goal threshold.
    const missedMins = stats?.total_missed_minutes ?? 0;
    const missedOverFloor = missedMins > MISSED_FLOOR_MINS;
    const canAct = hasProposals || missedOverFloor;

    // Deterministic wins first — they are facts. Anything the model added that
    // isn't already covered follows.
    // §4: hours the scheduler could not place. Information, NOT something to
    // accept — the remedies are the user's: edit the goal, or free up time.
    const notices: Array<{ goal_id: string; title: string; minutes: number; of_minutes: number }> =
        (stats as any)?.unplaceable_notices || [];
    const untouched: Array<{ goal_id: string; title: string; weekly_minutes: number }> =
        (stats as any)?.untouched_goals || [];

    const derivedWins = stats?.wins || [];
    const winsToShow = [...derivedWins, ...(ai?.achievements || [])].slice(0, 6);

    const handleExecute = async (mode: 'auto' | 'semi-auto' | 'manual', finalChanges?: ProposedChange[]) => {
        // Route to the review screen BEFORE any in-flight bookkeeping — this
        // path makes no request, so it must not look like an execution.
        if (mode === 'semi-auto' && !finalChanges) {
            setView('semi-auto');
            return;
        }

        // §6: `isExecuting` is React state and does not update synchronously, so
        // two rapid confirms could both pass the button's disabled check. A ref
        // closes that window — generating next week twice would duplicate the
        // whole schedule.
        if (executeInFlight.current) {
            console.warn('[WeeklyReview] Execute already in flight; ignoring duplicate.');
            return;
        }
        executeInFlight.current = true;
        setIsExecuting(true);
        const planningNotice = setTimeout(() => {
            setIsPlanning(true);
            // Past a few seconds the wait is the week generation, not the goal
            // writes. Say which, so 30s doesn't read as a hang.
            toast.loading('Planning next week…', { id: 'exec' });
        }, 3000);

        // Every mode records a decision, whether or not the AI produced one.
        const reportPayload = {
            data: {
                summary: ai?.available ? ai.summary : null,
                achievements: ai?.available ? ai.achievements : [],
                struggles: ai?.available ? ai.struggles : [],
                proposed_goal_changes: proposals,
            },
            metrics: stats?.metrics,
        };

        try {
            if (mode === 'auto') {
                toast.loading('Applying AI changes automatically...', { id: 'exec' });
                const res = await apiClient.post<ExecuteResponse>('/api/weekly-review/execute', {
                    mode: 'auto',
                    changes: proposals,
                    report: reportPayload,
                    weekStart,
                    weekEnd
                });
                reportOutcome(res);
                offerUndo(res);
                setView('done');
            } else if (mode === 'semi-auto') {
                toast.loading('Applying selected changes...', { id: 'exec' });
                const res = await apiClient.post<ExecuteResponse>('/api/weekly-review/execute', {
                    mode: 'semi-auto',
                    changes: finalChanges,
                    report: reportPayload,
                    weekStart,
                    weekEnd
                });
                reportOutcome(res);
                offerUndo(res);
                setView('done');
            } else {
                // Manual — declining is still a decision, so it is recorded
                // before we route away. With no AI report this writes
                // user_response 'ignored' and a null lever_action.
                await apiClient.post('/api/weekly-review/execute', {
                    mode: 'manual',
                    changes: [],
                    report: reportPayload,
                    weekStart,
                    weekEnd
                }).catch(e => console.error('[WeeklyReview] Failed to record manual response', e));
                toast.success('Continuing in manual mode.', { id: 'exec' });
                router.push('/app/goals');
            }
        } catch (e: any) {
            if (e?.code === REVIEW_WINDOW_CLOSED || e?.code === REVIEW_WEEK_NOT_REVIEWABLE) {
                // §5: the server wins. Show its closed state; nothing was written.
                setServerRefusal({ code: e.code, next_open_date: e?.details?.next_open_date, message: e?.message });
                setPendingApply(null);
                setView('report');
                toast.error(e?.message || 'The weekly review is closed today.', { id: 'exec', duration: 8000 });
            } else {
                toast.error('Failed to execute actions.', { id: 'exec' });
            }
        } finally {
            clearTimeout(planningNotice);
            setIsPlanning(false);
            executeInFlight.current = false;
            setIsExecuting(false);
        }
    };

    const toggleChange = (goalId: string) => {
        setApprovedChanges(prev => {
            const next = new Set(prev);
            if (next.has(goalId)) next.delete(goalId);
            else next.add(goalId);
            return next;
        });
    };

    /** Say what actually happened, using the counts the planner reported. */
    const reportOutcome = (res?: ExecuteResponse | null) => {
        const fmt = (iso?: string) => (iso ? prettyDate(iso) : '');
        if (res?.replanned && res.plan) {
            toast.success(
                `Next week (${fmt(res.plan.week_start)}–${fmt(res.plan.week_end)}) has been rebuilt: ${res.plan.blocks_created} blocks.`,
                { id: 'exec', duration: 8000 }
            );
            return;
        }
        if (res?.plan_error) {
            // The goal changes are already committed and reverting them would be
            // worse — but the user must not be told the week is ready.
            toast.error(
                res.applied_changes > 0
                    ? `Your goals were updated, but next week couldn't be generated. ${res.plan_error}`
                    : `Next week couldn't be generated. ${res.plan_error}`,
                { id: 'exec', duration: 12000 }
            );
            return;
        }
        toast.success('Review applied.', { id: 'exec' });
    };

    /**
     * The apply routes through PatchService with scope 'week', so a snapshot
     * exists and /api/calendar/undo can reverse both goals and schedule.
     */
    const offerUndo = (res?: ExecuteResponse | null) => {
        if (!res?.undo_token) return;
        toast('Next week regenerated.', {
            id: 'wr-undo',
            duration: 15000,
            action: {
                label: 'Undo',
                onClick: async () => {
                    try {
                        await apiClient.post('/api/calendar/undo', { token: res.undo_token });
                        toast.success('Reverted.', { id: 'wr-undo' });
                        if (weekStart) loadWeek(weekStart);
                    } catch (e) {
                        toast.error('Could not undo automatically.', { id: 'wr-undo' });
                    }
                },
            },
        });
    };

    const applySemiAuto = () => {
        const changesToApply = proposals.filter(c => approvedChanges.has(c.goal_id));
        if (changesToApply.length === 0) return;
        setPendingApply({ mode: 'semi-auto', changes: changesToApply });
    };

    const exitReview = () => {
        router.push('/app');
    };

    return (
        <div className="w-full min-h-screen min-h-dvh relative overflow-x-hidden">
            {/* SVG organic ribbon flows — purple palette */}
            <div
              aria-hidden
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: -1,
                pointerEvents: 'none',
                overflow: 'hidden',
              }}
            >
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
                  background: 'linear-gradient(to right, transparent, hsla(270,82%,62%,0.55) 40%, hsla(290,80%,65%,0.42) 65%, transparent)',
                }} />
                <svg
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                  viewBox="0 0 1440 900"
                  preserveAspectRatio="xMidYMid slice"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <defs>
                    <linearGradient id="review-r1" x1="1440" y1="-100" x2="0" y2="900" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stopColor="hsla(270,82%,62%,0.42)" />
                      <stop offset="40%" stopColor="hsla(275,78%,44%,0.22)" />
                      <stop offset="100%" stopColor="hsla(280,65%,18%,0)" />
                    </linearGradient>
                    <linearGradient id="review-r2" x1="1440" y1="200" x2="200" y2="900" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stopColor="hsla(290,75%,58%,0.24)" />
                      <stop offset="55%" stopColor="hsla(270,78%,50%,0.12)" />
                      <stop offset="100%" stopColor="transparent" />
                    </linearGradient>
                    <linearGradient id="review-r3" x1="1" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsla(270,82%,56%,0.20)" />
                      <stop offset="100%" stopColor="transparent" />
                    </linearGradient>
                    <filter id="review-shadow" x="-60%" y="-60%" width="220%" height="220%">
                      <feGaussianBlur stdDeviation="30" />
                    </filter>
                    <filter id="review-glow" x="-60%" y="-60%" width="220%" height="220%">
                      <feGaussianBlur stdDeviation="10" />
                    </filter>
                  </defs>

                  <path d="M 1600 -200 C 1300 20 1050 200 820 390 C 590 580 370 720 0 890 L 0 2000 L 1600 2000 Z" fill="url(#review-r1)" />
                  <path d="M 1430 -60 C 1130 170 890 350 670 530 C 450 710 240 830 -80 2000" stroke="hsla(270,60%,5%,0.55)" strokeWidth="100" fill="none" filter="url(#review-shadow)" />
                  <path d="M 1430 -60 C 1130 170 890 350 670 530 C 450 710 240 830 -80 2000" stroke="hsla(270,90%,78%,0.55)" strokeWidth="1.5" fill="none" />
                  <path d="M 1430 -60 C 1130 170 890 350 670 530 C 450 710 240 830 -80 2000" stroke="hsla(270,88%,65%,0.28)" strokeWidth="38" fill="none" filter="url(#review-glow)" />

                  <path d="M 1600 160 C 1300 360 1050 510 820 660 C 590 810 370 890 0 980 L 0 2000 L 1600 2000 Z" fill="url(#review-r2)" />
                  <path d="M 1430 220 C 1130 420 890 570 670 710 C 450 850 240 930 -80 2000" stroke="hsla(280,88%,70%,0.32)" strokeWidth="1.5" fill="none" />
                  <path d="M 1430 220 C 1130 420 890 570 670 710 C 450 850 240 930 -80 2000" stroke="hsla(270,88%,62%,0.18)" strokeWidth="32" fill="none" filter="url(#review-glow)" />
                  <path d="M 1600 -350 C 1500 -180 1350 -70 1200 40 C 1050 150 950 230 820 340 L 1600 340 Z" fill="url(#review-r3)" />
                </svg>
            </div>

            {/* Content scrolls over the stationary background in its own
                stacking context. */}
            <div className="relative z-0 max-w-3xl mx-auto pb-20 p-4 md:p-6 flex flex-col h-full">
            <header className="mb-8 flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">AI Weekly Review</h1>
                    <p className="text-sm text-[var(--text-tertiary)]">
                        {reviewWindow && !reviewWindow.is_open
                            ? 'A Monday ritual — past weeks are read-only until then'
                            : 'Reflect and recalibrate with PlannrAI'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {/* Week switcher — without it there is no way to reach a
                        week that actually has data. */}
                    <div className="flex items-center gap-1 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] p-1">
                        <button
                            onClick={() => setWeekStart(w => (w ? shift(w, -7) : w))}
                            disabled={statsLoading || !weekStart}
                            aria-label="Previous week"
                            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-hover)] disabled:opacity-40 transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="px-1 text-xs font-medium tabular-nums text-[var(--text-secondary)] whitespace-nowrap">
                            {weekStart ? `${prettyDate(weekStart)} – ${prettyDate(weekEnd)}` : '…'}
                        </span>
                        {/* §3a: the picker stops at LAST week. The current week
                            is in progress and its review is not due; it is
                            reachable by deep link only, where it renders the
                            closed state rather than a half-populated dashboard. */}
                        <button
                            onClick={() => setWeekStart(w => (w ? shift(w, 7) : w))}
                            disabled={
                                statsLoading ||
                                !weekStart ||
                                !reviewWindow ||
                                weekStart >= reviewWindow.last_monday
                            }
                            aria-label="Next week"
                            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-hover)] disabled:opacity-40 transition-colors"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                    <button
                        onClick={exitReview}
                        className="p-2 rounded-xl bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-[var(--text-secondary)] transition-colors flex items-center gap-2 text-sm font-medium"
                    >
                        <X className="w-4 h-4" /> Exit
                    </button>
                </div>
            </header>

            <div className="flex-1 flex flex-col items-center">
                <AnimatePresence mode="wait">
                    {statsLoading && (
                        <motion.div 
                            key="loading" 
                            initial={{ opacity: 0, scale: 0.98, filter: 'blur(10px)' }} 
                            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }} 
                            exit={{ opacity: 0, scale: 0.98, filter: 'blur(10px)' }} 
                            className="w-full flex-1 flex flex-col items-center justify-center py-10 md:py-20 relative"
                        >
                            {/* The Premium Thick Heartbeat Path extending across the screen */}
                            <div className="relative z-10 w-full h-72 mb-16 flex items-center justify-center pointer-events-none">
                                <div className="absolute left-1/2 -translate-x-1/2 w-[200vw] md:w-[100vw] h-full flex items-center justify-center">
                                    <svg className="w-full h-full overflow-visible drop-shadow-[0_0_30px_rgba(217,70,239,0.5)]" viewBox="0 0 1000 300" preserveAspectRatio="none">
                                        <defs>
                                            <linearGradient id="premium-pulse" x1="0" y1="0" x2="1" y2="0">
                                                <stop offset="0%" stopColor="transparent" />
                                                <stop offset="30%" stopColor="#7c3aed" /> {/* violet-600 */}
                                                <stop offset="50%" stopColor="#d946ef" /> {/* fuchsia-500 */}
                                                <stop offset="70%" stopColor="#f472b6" /> {/* pink-400 */}
                                                <stop offset="100%" stopColor="transparent" />
                                            </linearGradient>
                                            <filter id="ultra-glow" x="-50%" y="-50%" width="200%" height="200%">
                                                <feGaussianBlur stdDeviation="10" result="blur1" />
                                                <feGaussianBlur stdDeviation="24" result="blur2" />
                                                <feMerge>
                                                    <feMergeNode in="blur2" />
                                                    <feMergeNode in="blur1" />
                                                    <feMergeNode in="SourceGraphic" />
                                                </feMerge>
                                            </filter>
                                            <filter id="core-glow" x="-20%" y="-20%" width="140%" height="140%">
                                                <feGaussianBlur stdDeviation="3" />
                                            </filter>
                                        </defs>
                                        
                                        {/* Thick Ambient Background Track */}
                                        <path 
                                            d="M 0 150 L 350 150 L 380 70 L 410 230 L 450 30 L 490 270 L 530 80 L 570 200 L 610 120 L 650 150 L 1000 150" 
                                            stroke="url(#premium-pulse)" 
                                            strokeWidth="16" 
                                            strokeOpacity="0.2"
                                            fill="none" 
                                            strokeLinejoin="round"
                                            strokeLinecap="round"
                                        />

                                        {/* Deep Glowing Aura Trail */}
                                        <motion.path 
                                            d="M 0 150 L 350 150 L 380 70 L 410 230 L 450 30 L 490 270 L 530 80 L 570 200 L 610 120 L 650 150 L 1000 150" 
                                            stroke="url(#premium-pulse)" 
                                            strokeWidth="24" 
                                            fill="none" 
                                            strokeLinejoin="round"
                                            strokeLinecap="round"
                                            filter="url(#ultra-glow)"
                                            initial={{ pathLength: 0.5, pathOffset: -0.5 }}
                                            animate={{ pathOffset: 1 }}
                                            transition={{ duration: 3.5, repeat: Infinity, ease: 'linear' }}
                                        />

                                        {/* The Thick Solid Colorful Tube */}
                                        <motion.path 
                                            d="M 0 150 L 350 150 L 380 70 L 410 230 L 450 30 L 490 270 L 530 80 L 570 200 L 610 120 L 650 150 L 1000 150" 
                                            stroke="url(#premium-pulse)" 
                                            strokeWidth="12" 
                                            fill="none" 
                                            strokeLinejoin="round"
                                            strokeLinecap="round"
                                            initial={{ pathLength: 0.35, pathOffset: -0.35 }}
                                            animate={{ pathOffset: 1.15 }}
                                            transition={{ duration: 3.5, repeat: Infinity, ease: 'linear' }}
                                        />

                                        {/* Bright White Volume Core */}
                                        <motion.path 
                                            d="M 0 150 L 350 150 L 380 70 L 410 230 L 450 30 L 490 270 L 530 80 L 570 200 L 610 120 L 650 150 L 1000 150" 
                                            stroke="#ffffff" 
                                            strokeWidth="4" 
                                            fill="none" 
                                            strokeLinejoin="round"
                                            strokeLinecap="round"
                                            filter="url(#core-glow)"
                                            initial={{ pathLength: 0.25, pathOffset: -0.25 }}
                                            animate={{ pathOffset: 1.25 }}
                                            transition={{ duration: 3.5, repeat: Infinity, ease: 'linear' }}
                                        />
                                    </svg>
                                </div>
                            </div>

                            {/* Text Area */}
                            <div className="relative z-10 text-center flex flex-col items-center px-4">
                                <h3 className="text-4xl md:text-5xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-white to-purple-200 drop-shadow-sm mb-4">
                                    Analyzing Your Week
                                </h3>
                                
                                <div className="h-10 flex items-center justify-center">
                                    <AnimatePresence mode="wait">
                                        <motion.p
                                            key={loadingMessage}
                                            initial={{ opacity: 0, y: 15, filter: 'blur(8px)' }}
                                            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                                            exit={{ opacity: 0, y: -15, filter: 'blur(8px)' }}
                                            transition={{ duration: 0.5, ease: "easeOut" }}
                                            className="text-lg md:text-xl font-bold text-purple-300/80 tracking-wide"
                                        >
                                            {loadingMessage}
                                        </motion.p>
                                    </AnimatePresence>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* EMPTY WEEK — the default week is last week, which on a
                        fresh database is very often empty. Say so plainly
                        instead of rendering a dashboard of zeros. */}
                    {/* §3a: the current week is in progress. Whether or not it
                        has data yet, what renders where the review would be is
                        the closed-state message — never "no data", never a
                        half-populated dashboard with actions. */}
                    {!statsLoading && reviewWindow && weekInfo && (weekInfo.is_current_week || weekInfo.is_future_week) && (stats?.profile?.data_points ?? 0) === 0 && view === 'report' && (
                        <motion.div key="current-empty" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="w-full space-y-6">
                            <ReviewStatePanel window={reviewWindow} week={weekInfo} refusal={serverRefusal} hasStats={false} />
                            {weekStart !== reviewWindow.last_monday && (
                                <div className="flex justify-center">
                                    <button
                                        onClick={() => setWeekStart(reviewWindow.last_monday)}
                                        className="px-5 py-2.5 rounded-xl bg-[var(--color-primary)] text-white text-sm font-bold hover:brightness-110 transition-all"
                                    >
                                        View last week instead
                                    </button>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {!statsLoading && !(reviewWindow && weekInfo && (weekInfo.is_current_week || weekInfo.is_future_week)) && (stats?.profile?.data_points ?? 0) === 0 && view === 'report' && (
                        <motion.div key="empty" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="w-full flex flex-col items-center justify-center text-center py-16 md:py-24 space-y-4">
                            <div className="w-16 h-16 rounded-full bg-[var(--glass-bg)] border border-[var(--glass-border)] flex items-center justify-center">
                                <CalendarX className="w-7 h-7 text-[var(--text-tertiary)]" />
                            </div>
                            <h2 className="text-xl font-bold">No data for the week of {weekStart ? prettyDate(weekStart) : ''}</h2>
                            <p className="text-sm text-[var(--text-tertiary)] max-w-sm">
                                The review looks at last week by default. Nothing was scheduled or marked in
                                that window, so there is nothing to summarise yet.
                            </p>
                            {reviewWindow && weekStart !== reviewWindow.last_monday && (
                                <button
                                    onClick={() => setWeekStart(reviewWindow.last_monday)}
                                    className="mt-2 px-5 py-2.5 rounded-xl bg-[var(--color-primary)] text-white text-sm font-bold hover:brightness-110 transition-all"
                                >
                                    View last week instead
                                </button>
                            )}
                        </motion.div>
                    )}

                    {!statsLoading && stats && (stats.profile?.data_points ?? 0) > 0 && view === 'report' && (
                        <motion.div key="report" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }} className="w-full space-y-8">

                            {/* 1. Real numbers first — these come from a route
                                that cannot fail, so they render immediately
                                while the AI is still thinking. */}
                            <ProductivityProfile profile={stats.profile} />

                            {/* 2. The Day Chain, from the same payload. */}
                            <DayChain chain={stats.chain} />

                            {/* 3. The AI summary — one optional card with three
                                states. Its failure is contained here. */}
                            {/* Skeleton only on the FIRST attempt. Once a result
                                exists, a retry keeps the card on screen so the
                                button can show its own in-flight spinner —
                                otherwise that branch is unreachable. */}
                            {!reviewOpen && reviewWindow ? (
                                /* Prompt 54 §3/§4: closed today, the current
                                   week, or a past week's terminal state. No AI
                                   was requested for this week and none will be. */
                                <ReviewStatePanel window={reviewWindow} week={weekInfo} refusal={serverRefusal} />
                            ) : !reviewOpen ? (
                                /* Status never arrived: the page still loads
                                   (§3) but the review is treated as closed. */
                                <div className="p-6 rounded-3xl bg-[var(--glass-bg)] border border-[var(--glass-border)] backdrop-blur-xl">
                                    <h2 className="text-lg font-bold">The weekly review opens on Mondays</h2>
                                    <p className="text-sm text-[var(--text-tertiary)] mt-1">
                                        Couldn&apos;t confirm today&apos;s review status. Your numbers above are unaffected.
                                    </p>
                                </div>
                            ) : aiLoading && !ai ? (
                                <div className="p-6 rounded-3xl bg-[var(--glass-bg)] border border-[var(--glass-border)] backdrop-blur-xl animate-pulse">
                                    <div className="flex items-center gap-3 mb-5">
                                        <div className="w-10 h-10 rounded-full bg-[var(--glass-border)]/50" />
                                        <div className="h-5 w-40 rounded bg-[var(--glass-border)]/50" />
                                    </div>
                                    <div className="space-y-2.5">
                                        <div className="h-3.5 w-full rounded bg-[var(--glass-border)]/40" />
                                        <div className="h-3.5 w-11/12 rounded bg-[var(--glass-border)]/40" />
                                        <div className="h-3.5 w-3/5 rounded bg-[var(--glass-border)]/40" />
                                    </div>
                                </div>
                            ) : ai?.available ? (
                                <>
                                    {/* Summary Card */}
                                    <div className="p-6 rounded-3xl bg-[var(--glass-bg)] border border-[var(--glass-border)] backdrop-blur-xl">
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="w-10 h-10 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center">
                                                <Brain className="w-5 h-5 text-[var(--color-primary)]" />
                                            </div>
                                            <h2 className="text-xl font-bold">Week in Review</h2>
                                        </div>
                                        <p className="text-[var(--text-primary)] leading-relaxed text-sm md:text-base">
                                            {ai.summary}
                                        </p>

                                        <div className="mt-6 flex gap-4 text-sm font-medium">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                                <span>{Math.round((stats.metrics?.completedMinutes || 0) / 60)}h Completed</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-red-500" />
                                                <span>{Math.round((stats.metrics?.skippedMinutes || 0) / 60)}h Skipped</span>
                                            </div>
                                        </div>
                                    </div>

                                </>
                            ) : (
                                /* Quiet and neutral. Your numbers above are fine;
                                   only the paragraph is missing. */
                                <div className="p-6 rounded-3xl bg-[var(--glass-bg)] border border-[var(--glass-border)] backdrop-blur-xl flex items-center justify-between gap-4 flex-wrap">
                                    <div>
                                        <h2 className="text-base font-bold text-[var(--text-primary)]">
                                            {ai?.rate_limited
                                                ? 'Rate limit reached'
                                                : "Couldn't generate this week's summary"}
                                        </h2>
                                        <p className="text-sm text-[var(--text-tertiary)] mt-1">
                                            {ai?.rate_limited
                                                ? 'The AI provider is busy. Try again in a minute — your numbers above are unaffected.'
                                                : "Your numbers above are all here. The written recap just didn't come through."}
                                        </p>
                                        {/* Dev-only: every provider failure we can observe,
                                            ordered so the actionable one (a 429) leads rather
                                            than whichever provider happened to be last. */}
                                        {isDev && (ai?.provider_errors?.length ?? 0) > 0 && (
                                            <ul className="mt-2 space-y-1">
                                                {ai!.provider_errors!.map((e, i) => (
                                                    <li
                                                        key={`${e.provider}-${i}`}
                                                        className="text-[11px] font-mono text-[var(--text-muted)] break-all"
                                                    >
                                                        <span className="font-bold">
                                                            {e.provider}
                                                            {e.status ? ` ${e.status}` : ''}
                                                        </span>{' '}
                                                        <span className="opacity-70">{e.model}</span> — {e.message}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                        {isDev && !ai?.provider_errors?.length && ai?.reason && (
                                            <p className="text-[11px] font-mono text-[var(--text-muted)] mt-2 break-all">
                                                {ai.reason}
                                            </p>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => weekStart && fetchAi(weekStart, weekEnd, true)}
                                        disabled={aiLoading || cooldownLeft > 0}
                                        title={
                                            cooldownLeft > 0
                                                ? 'Retrying too quickly exhausts the provider’s per-minute budget'
                                                : undefined
                                        }
                                        className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm font-medium text-[var(--text-secondary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {aiLoading ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" /> Retrying…
                                            </>
                                        ) : cooldownLeft > 0 ? (
                                            <>
                                                <RefreshCw className="w-4 h-4" /> Retry in {cooldownLeft}s
                                            </>
                                        ) : (
                                            <>
                                                <RefreshCw className="w-4 h-4" /> Retry
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}

                            {/* Wins & Struggles.
                                Deliberately OUTSIDE the AI branch. Wins are
                                arithmetic — goals that hit target, hours done,
                                clean days, the chain — and used to vanish
                                entirely whenever a provider was rate-limited,
                                even though every fact was already in the stats
                                payload. Neither card may ever render as an
                                empty box with a heading. */}
                            {!statsLoading && (
                                <div className="grid md:grid-cols-2 gap-4">
                                    <div
                                        style={{ background: 'var(--color-bg-primary)' }}
                                        className="p-5 rounded-2xl border border-emerald-500/30"
                                    >
                                        <div className="flex items-center gap-2 mb-3">
                                            <Star className="w-5 h-5 text-emerald-600 dark:text-emerald-500" />
                                            <h3 className="font-bold text-emerald-700 dark:text-emerald-500">Wins</h3>
                                        </div>
                                        {winsToShow.length > 0 ? (
                                            <ul className="space-y-2">
                                                {winsToShow.map((win, i) => (
                                                    <li key={i} className="text-sm text-[var(--text-secondary)] flex items-start gap-2">
                                                        <span className="text-emerald-600 dark:text-emerald-500 mt-0.5">•</span> {win}
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <p className="text-sm text-[var(--text-tertiary)]">
                                                Nothing was marked done this week, so there is nothing to
                                                celebrate yet. Mark blocks as you finish them and this fills
                                                itself in.
                                            </p>
                                        )}
                                    </div>
                                    <div
                                        style={{ background: 'var(--color-bg-primary)' }}
                                        className="p-5 rounded-2xl border border-red-500/30"
                                    >
                                        <div className="flex items-center gap-2 mb-3">
                                            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-500" />
                                            <h3 className="font-bold text-red-700 dark:text-red-500">Struggles</h3>
                                        </div>
                                        {(ai?.struggles?.length ?? 0) > 0 ? (
                                            <ul className="space-y-2">
                                                {ai!.struggles.map((strug, i) => (
                                                    <li key={i} className="text-sm text-[var(--text-secondary)] flex items-start gap-2">
                                                        <span className="text-red-600 dark:text-red-500 mt-0.5">•</span> {strug}
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <p className="text-sm text-[var(--text-tertiary)]">
                                                {/* "The AI hasn't come through" is only true when it
                                                    hasn't. A model that answered and found nothing to
                                                    flag is a different — and much better — state. */}
                                                {ai?.available
                                                    ? missedMins > 0
                                                        ? `${formatMins(missedMins)} of planned work didn't happen, but no single pattern stands out.`
                                                        : 'Nothing stands out as a struggle this week.'
                                                    : !reviewOpen
                                                      ? missedMins > 0
                                                          ? `${formatMins(missedMins)} of planned work didn't happen.`
                                                          : 'Nothing was missed this week.'
                                                      : missedMins > 0
                                                        ? `${formatMins(missedMins)} of planned work didn't happen. The written read on why needs the AI, which hasn't come through.`
                                                        : 'No struggles to report — and the written recap has not come through.'}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* §4: a shortfall the scheduler could not place is a
                                NOTICE. It has no checkbox and no Apply — the
                                review may never respond to it by cutting the
                                goal, so there is nothing here to accept. */}
                            {reviewOpen && (notices.length > 0 || untouched.length > 0) && (
                                <div
                                    style={{ background: 'var(--color-bg-primary)' }}
                                    className="p-5 rounded-2xl border border-amber-500/30"
                                >
                                    <div className="flex items-center gap-2 mb-3">
                                        <AlertTriangle className="w-5 h-5 text-amber-700 dark:text-amber-400" />
                                        <h3 className="font-bold text-amber-700 dark:text-amber-400">
                                            Worth knowing
                                        </h3>
                                        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border border-[var(--glass-border)] text-[var(--text-muted)]">
                                            not a change
                                        </span>
                                    </div>
                                    <ul className="space-y-2">
                                        {notices.map((n) => (
                                            <li key={n.goal_id} className="text-sm text-[var(--text-secondary)]">
                                                <strong>{n.title}:</strong> {formatMins(n.minutes)} of your{' '}
                                                {formatMins(n.of_minutes)} couldn&apos;t be placed next week.
                                                Everything that fits is scheduled — to change this, edit the
                                                goal on the Goals page or free up some time.
                                            </li>
                                        ))}
                                        {untouched.map((u) => (
                                            <li key={u.goal_id} className="text-sm text-[var(--text-secondary)]">
                                                You haven&apos;t touched <strong>{u.title}</strong> in two weeks.
                                                You can pause it on the Goals page if you want to.
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* 4. Actions. Manual never depends on the AI.
                                Prompt 54: rendered ONLY while the review is
                                open for this week. A closed week has no
                                execution controls at all. */}
                            {reviewOpen && (
                            <div className="pt-8 border-t border-[var(--glass-border)]">
                                <h3 className="text-lg font-bold mb-2 text-center">How would you like to proceed?</h3>
                                {/* A greyed-out button with a hover-only tooltip reads as a
                                    bug, and is invisible entirely on touch. */}
                                <p className="text-sm text-center text-[var(--text-tertiary)] mb-4">
                                    {hasProposals
                                        ? `${formatMins(missedMins)} missed this week — ${proposals.length} ${proposals.length === 1 ? 'adjustment' : 'adjustments'} suggested.`
                                        : missedOverFloor
                                          ? `${formatMins(missedMins)} missed this week. Nothing to change goal-by-goal, but next week can still be rebuilt.`
                                          : `You missed ${formatMins(missedMins)} this week — nothing worth changing.`}
                                </p>
                                <div className="grid md:grid-cols-3 gap-4">
                                    <button
                                        onClick={() => setPendingApply({ mode: 'auto', changes: proposals })}
                                        disabled={isExecuting || !canAct}
                                        title={!canAct ? `Only ${formatMins(missedMins)} missed — your goals matched your week.` : undefined}
                                        className="flex flex-col items-start p-5 rounded-2xl bg-[var(--color-primary)]/10 hover:bg-[var(--color-primary)]/20 border border-[var(--color-primary)]/30 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <span className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2 mb-2">
                                            <Zap className="w-4 h-4 text-[var(--color-primary)]" /> Automatic
                                        </span>
                                        <span className="text-xs text-[var(--text-secondary)] leading-relaxed">
                                            Applies all {proposals.length} proposed goal {proposals.length === 1 ? 'adjustment' : 'adjustments'} and replans the week.
                                        </span>
                                    </button>

                                    <button
                                        onClick={() => handleExecute('semi-auto')}
                                        disabled={isExecuting || !canAct}
                                        title={!canAct ? `Only ${formatMins(missedMins)} missed — your goals matched your week.` : undefined}
                                        className="flex flex-col items-start p-5 rounded-2xl bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <span className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2 mb-2">
                                            <Target className="w-4 h-4 text-[var(--color-mind)]" /> Semi-Automated
                                        </span>
                                        <span className="text-xs text-[var(--text-tertiary)] leading-relaxed">
                                            {hasProposals
                                                ? `Review ${proposals.length} proposed ${proposals.length === 1 ? 'change' : 'changes'} to your goals before applying.`
                                                : 'Your goals matched your week — nothing to change.'}
                                        </span>
                                    </button>

                                    <button
                                        onClick={() => handleExecute('manual')}
                                        disabled={isExecuting}
                                        className="flex flex-col items-start p-5 rounded-2xl bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] transition-all text-left disabled:opacity-50"
                                    >
                                        <span className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2 mb-2">
                                            <MessageCircle className="w-4 h-4" /> Manual
                                        </span>
                                        <span className="text-xs text-[var(--text-tertiary)] leading-relaxed">
                                            Ignore AI suggestions and go directly to the goals dashboard to plan manually.
                                        </span>
                                    </button>
                                </div>
                            </div>
                            )}
                        </motion.div>
                    )}

                    {!statsLoading && reviewOpen && hasProposals && view === 'semi-auto' && (
                        <motion.div key="semi-auto" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="w-full space-y-6">
                            <div className="flex items-center gap-4 mb-6">
                                <button onClick={() => setView('report')} className="p-2 bg-[var(--glass-bg)] rounded-xl border border-[var(--glass-border)] text-[var(--text-secondary)] hover:text-white transition-colors">
                                    <ArrowLeft className="w-4 h-4" />
                                </button>
                                <h2 className="text-2xl font-bold">Review Goal Changes</h2>
                            </div>

                            <div className="space-y-4">
                                {proposals.map(change => {
                                    const isApproved = approvedChanges.has(change.goal_id);
                                    const st = styleFor(change.change_type);
                                    const oldWeekly = change.old_weekly_minutes;
                                    const newWeekly = change.new_weekly_minutes;
                                    // A shape change keeps the hours. Say so on the
                                    // card, in the same place a cut says the opposite.
                                    const keepsHours =
                                        !st.givesUpHours &&
                                        typeof oldWeekly === 'number' &&
                                        typeof newWeekly === 'number' &&
                                        Math.abs(newWeekly - oldWeekly) <= 5;
                                    return (
                                        <div 
                                            key={change.goal_id}
                                            onClick={() => toggleChange(change.goal_id)}
                                            style={{ background: 'var(--color-bg-primary)' }}
                                            className={`p-5 rounded-2xl border cursor-pointer transition-all ${
                                                isApproved
                                                    ? st.ring
                                                    : 'border-[var(--glass-border)] opacity-60'
                                            }`}
                                        >
                                            <div className="flex items-start gap-4">
                                                <div className="mt-1">
                                                    {isApproved ? (
                                                        <CheckCircle2 className={`w-5 h-5 ${st.accent}`} />
                                                    ) : (
                                                        <Circle className="w-5 h-5 text-[var(--text-tertiary)]" />
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-bold text-[var(--text-primary)] mb-1 flex items-center gap-2 flex-wrap">
                                                        {change.title}
                                                        <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${st.chip}`}>
                                                            {st.label}
                                                        </span>
                                                    </h4>

                                                    {/* The principle, verbatim from the
                                                        deterministic layer. */}
                                                    <p className={`text-sm font-semibold ${st.accent} flex items-center gap-1.5`}>
                                                        {st.givesUpHours
                                                            ? <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                                            : <Shuffle className="w-3.5 h-3.5 shrink-0" />}
                                                        {change.headline}
                                                    </p>

                                                    <div className="flex items-center gap-3 text-sm font-medium my-3 p-3 bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl flex-wrap">
                                                        <span className="text-[var(--text-tertiary)] line-through">{change.old_value}</span>
                                                        <ArrowRight className={`w-4 h-4 ${st.accent}`} />
                                                        <span className="text-[var(--text-primary)]">{change.new_value}</span>
                                                    </div>

                                                    {typeof oldWeekly === 'number' && typeof newWeekly === 'number' && (
                                                        <p className="text-xs mb-2">
                                                            {keepsHours ? (
                                                                <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                                                                    Weekly total unchanged — still {formatMins(newWeekly)}.
                                                                </span>
                                                            ) : (
                                                                <span className="text-amber-700 dark:text-amber-400 font-medium">
                                                                    Weekly total {formatMins(oldWeekly)} → {formatMins(newWeekly)}
                                                                    {' '}({formatMins(oldWeekly - newWeekly)} less).
                                                                </span>
                                                            )}
                                                        </p>
                                                    )}

                                                    <p className="text-sm text-[var(--text-secondary)] italic">
                                                        <ArrowDownRight className="inline w-3 h-3 mr-1 text-[var(--text-tertiary)]" />
                                                        {change.rationale}
                                                    </p>
                                                    {/* The evidence, stated plainly. A user should
                                                        be able to see why they are being asked to
                                                        change something. */}
                                                    {(change.evidence?.missed_minutes ?? 0) > 0 && (
                                                        <p className="text-xs text-[var(--text-muted)] mt-2">
                                                            {formatMins(change.evidence.completed_minutes)} of{' '}
                                                            {formatMins(change.evidence.target_minutes)} done
                                                            {change.evidence.missed_dates.length > 0 && (
                                                                <> · missed on {namedDays(change.evidence.missed_dates)}</>
                                                            )}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>

                            <div className="pt-6">
                                <button
                                    onClick={applySemiAuto}
                                    disabled={isExecuting}
                                    className="w-full py-4 rounded-xl font-bold bg-[var(--color-primary)] text-white hover:brightness-110 flex items-center justify-center gap-2 disabled:opacity-50 transition-all shadow-lg shadow-[var(--color-primary)]/20"
                                >
                                    {isExecuting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Target className="w-5 h-5" />}
                                    Apply {approvedChanges.size} {approvedChanges.size === 1 ? 'Change' : 'Changes'}
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {!statsLoading && view === 'done' && (
                        <motion.div key="done" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center justify-center py-10 md:py-20 text-center space-y-6">
                            <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center">
                                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                            </div>
                            <h2 className="text-3xl font-bold">You're All Set!</h2>
                            <p className="text-[var(--text-secondary)]">Your goals and priorities have been updated for the new week. Let's make it count.</p>
                            <button
                                onClick={exitReview}
                                className="px-8 py-3 rounded-xl bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm font-bold transition-all mt-4"
                            >
                                Back to Dashboard
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
            </div>

            {/* Nothing is written until this is confirmed. */}
            <ConfirmChangesModal
                isOpen={!!pendingApply}
                changes={pendingApply?.changes || []}
                isApplying={isExecuting}
                isPlanning={isPlanning}
                targetWeekLabel={
                    reviewWindow
                        ? `${prettyDate(reviewWindow.this_monday)}–${prettyDate(shift(reviewWindow.this_monday, 6))}`
                        : 'this week'
                }
                onCancel={() => setPendingApply(null)}
                onConfirm={() => {
                    const p = pendingApply;
                    setPendingApply(null);
                    if (!p) return;
                    if (p.mode === 'auto') handleExecute('auto');
                    else handleExecute('semi-auto', p.changes);
                }}
            />
        </div>
    );
}
