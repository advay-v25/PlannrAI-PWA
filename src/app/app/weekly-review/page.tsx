'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { Loader2, ArrowRight, ArrowLeft, Brain, Zap, Target, Star, AlertTriangle, MessageCircle, X, CheckCircle2, Circle, ArrowDownRight, ChevronLeft, ChevronRight, RefreshCw, CalendarX } from 'lucide-react';
import ProductivityProfile, { type ProfileAnalysis } from '@/components/weekly-review/productivity-profile';
import { DayChain, type ChainResponse } from '@/components/weekly-review/day-chain';
import { ConfirmChangesModal } from '@/components/weekly-review/confirm-changes-modal';

interface ProposedChange {
    goal_id: string;
    title: string;
    change_type: "update_time" | "update_days" | "pause";
    old_value: string;
    new_value: string;
    rationale: string;
}

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
}

/** AI half. `available: false` is a normal outcome, never an error. */
interface AiResponse {
    available: boolean;
    reason?: string;
    summary: string | null;
    achievements: string[];
    struggles: string[];
}

interface ExecuteResponse {
    success: boolean;
    applied_changes: number;
    skipped_changes?: number;
    replanned: boolean;
    undo_token?: string | null;
}

const isDev = process.env.NODE_ENV !== 'production';

/** yyyy-MM-dd maths that never touches the local timezone. */
const shift = (iso: string, days: number) => {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().slice(0, 10);
};

/** Monday of the week containing `iso`. */
const mondayOf = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
    const offset = (dt.getUTCDay() + 6) % 7; // Monday = 0
    return shift(iso, -offset);
};

const thisMonday = () => mondayOf(new Date().toISOString().slice(0, 10));
/** The review defaults to the *previous* Mon–Sun, matching the API. */
const lastMonday = () => shift(thisMonday(), -7);

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
    const [weekStart, setWeekStart] = useState<string>(lastMonday);
    const weekEnd = shift(weekStart, 6);

    // Deterministic data — drives the whole page and its loading state.
    const [stats, setStats] = useState<StatsResponse | null>(null);
    const [statsLoading, setStatsLoading] = useState(true);

    // AI narrative — drives exactly one optional card, with its own state.
    const [ai, setAi] = useState<AiResponse | null>(null);
    const [aiLoading, setAiLoading] = useState(true);

    const [isExecuting, setIsExecuting] = useState(false);
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
    const fetchAi = useCallback(async (start: string, end: string) => {
        setAiLoading(true);
        try {
            const res = await apiClient.post<AiResponse>('/api/weekly-review/generate-report', {
                weekStart: start,
                weekEnd: end,
            });
            setAi(res);
        } catch (err) {
            // A missing paragraph is not worth a toast when the dashboard rendered.
            console.warn('[WeeklyReview] AI summary unavailable:', err);
            setAi({ available: false, summary: null, achievements: [], struggles: [] });
        } finally {
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
        setStatsLoading(true);
        setAi(null);
        setAiLoading(true);
        setApprovedChanges(new Set());

        let loaded: StatsResponse | null = null;
        try {
            loaded = await apiClient.get<StatsResponse>(
                `/api/weekly-review/stats?weekStart=${start}&weekEnd=${end}`
            );
            setStats(loaded);
            // Proposals come from /stats, so they are ready before the AI is —
            // and stay ready even if the AI never arrives.
            setApprovedChanges(new Set((loaded?.proposed_goal_changes || []).map(c => c.goal_id)));
        } catch (err) {
            console.error('[WeeklyReview] Stats fetch failed:', err);
            setStats(null);
        } finally {
            setStatsLoading(false);
        }

        if ((loaded?.profile?.data_points ?? 0) > 0) {
            fetchAi(start, end);
        } else {
            setAiLoading(false);
        }
    }, [fetchAi]);

    useEffect(() => {
        loadWeek(weekStart);
    }, [weekStart, loadWeek]);

    // Nothing is written until this is confirmed. Automatic and Semi-Automated
    // both route through it.
    const [pendingApply, setPendingApply] = useState<{
        mode: 'auto' | 'semi-auto';
        changes: ProposedChange[];
    } | null>(null);

    /** The deterministic proposals. Never sourced from the AI. */
    const proposals: ProposedChange[] = stats?.proposed_goal_changes || [];
    const hasProposals = proposals.length > 0;

    const handleExecute = async (mode: 'auto' | 'semi-auto' | 'manual', finalChanges?: ProposedChange[]) => {
        setIsExecuting(true);

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
                toast.success('Goals updated!', { id: 'exec' });
                offerUndo(res);
                setView('done');
            } else if (mode === 'semi-auto') {
                if (!finalChanges) {
                    // Go to review screen
                    setView('semi-auto');
                    setIsExecuting(false);
                    return;
                }
                toast.loading('Applying selected changes...', { id: 'exec' });
                const res = await apiClient.post<ExecuteResponse>('/api/weekly-review/execute', {
                    mode: 'semi-auto',
                    changes: finalChanges,
                    report: reportPayload,
                    weekStart,
                    weekEnd
                });
                toast.success('Selected changes applied!', { id: 'exec' });
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
        } catch (e) {
            toast.error('Failed to execute actions.', { id: 'exec' });
        } finally {
            if (mode !== 'semi-auto' || finalChanges) {
                setIsExecuting(false);
            }
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
                        loadWeek(weekStart);
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
                    <p className="text-sm text-[var(--text-tertiary)]">Reflect and recalibrate with PlannrAI</p>
                </div>
                <div className="flex items-center gap-2">
                    {/* Week switcher — without it there is no way to reach a
                        week that actually has data. */}
                    <div className="flex items-center gap-1 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] p-1">
                        <button
                            onClick={() => setWeekStart(w => shift(w, -7))}
                            disabled={statsLoading}
                            aria-label="Previous week"
                            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-hover)] disabled:opacity-40 transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="px-1 text-xs font-medium tabular-nums text-[var(--text-secondary)] whitespace-nowrap">
                            {prettyDate(weekStart)} – {prettyDate(weekEnd)}
                        </span>
                        <button
                            onClick={() => setWeekStart(w => shift(w, 7))}
                            disabled={statsLoading || weekStart >= thisMonday()}
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
                    {!statsLoading && (stats?.profile?.data_points ?? 0) === 0 && view === 'report' && (
                        <motion.div key="empty" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="w-full flex flex-col items-center justify-center text-center py-16 md:py-24 space-y-4">
                            <div className="w-16 h-16 rounded-full bg-[var(--glass-bg)] border border-[var(--glass-border)] flex items-center justify-center">
                                <CalendarX className="w-7 h-7 text-[var(--text-tertiary)]" />
                            </div>
                            <h2 className="text-xl font-bold">No data for the week of {prettyDate(weekStart)}</h2>
                            <p className="text-sm text-[var(--text-tertiary)] max-w-sm">
                                The review looks at last week by default. Nothing was scheduled or marked in
                                that window, so there is nothing to summarise yet.
                            </p>
                            {weekStart !== thisMonday() && (
                                <button
                                    onClick={() => setWeekStart(thisMonday())}
                                    className="mt-2 px-5 py-2.5 rounded-xl bg-[var(--color-primary)] text-white text-sm font-bold hover:brightness-110 transition-all"
                                >
                                    View this week instead
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
                            {aiLoading ? (
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

                                    {/* Achievements & Struggles */}
                                    <div className="grid md:grid-cols-2 gap-4">
                                        <div className="p-5 rounded-2xl bg-emerald-500/5 border border-emerald-500/20">
                                            <div className="flex items-center gap-2 mb-3">
                                                <Star className="w-5 h-5 text-emerald-500" />
                                                <h3 className="font-bold text-emerald-500">Wins</h3>
                                            </div>
                                            <ul className="space-y-2">
                                                {ai.achievements.map((ach, i) => (
                                                    <li key={i} className="text-sm text-[var(--text-secondary)] flex items-start gap-2">
                                                        <span className="text-emerald-500 mt-0.5">•</span> {ach}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                        <div className="p-5 rounded-2xl bg-red-500/5 border border-red-500/20">
                                            <div className="flex items-center gap-2 mb-3">
                                                <AlertTriangle className="w-5 h-5 text-red-500" />
                                                <h3 className="font-bold text-red-500">Struggles</h3>
                                            </div>
                                            <ul className="space-y-2">
                                                {ai.struggles.map((strug, i) => (
                                                    <li key={i} className="text-sm text-[var(--text-secondary)] flex items-start gap-2">
                                                        <span className="text-red-500 mt-0.5">•</span> {strug}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                /* Quiet and neutral. Your numbers above are fine;
                                   only the paragraph is missing. */
                                <div className="p-6 rounded-3xl bg-[var(--glass-bg)] border border-[var(--glass-border)] backdrop-blur-xl flex items-center justify-between gap-4 flex-wrap">
                                    <div>
                                        <h2 className="text-base font-bold text-[var(--text-primary)]">
                                            Couldn&apos;t generate this week&apos;s summary
                                        </h2>
                                        <p className="text-sm text-[var(--text-tertiary)] mt-1">
                                            Your numbers above are all here. The written recap just didn&apos;t come through.
                                        </p>
                                        {isDev && ai?.reason && (
                                            <p className="text-[11px] font-mono text-[var(--text-muted)] mt-2 break-all">
                                                {ai.reason}
                                            </p>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => fetchAi(weekStart, weekEnd)}
                                        className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm font-medium text-[var(--text-secondary)] transition-colors"
                                    >
                                        <RefreshCw className="w-4 h-4" /> Retry
                                    </button>
                                </div>
                            )}

                            {/* 4. Actions. Manual never depends on the AI. */}
                            <div className="pt-8 border-t border-[var(--glass-border)]">
                                <h3 className="text-lg font-bold mb-4 text-center">How would you like to proceed?</h3>
                                <div className="grid md:grid-cols-3 gap-4">
                                    <button
                                        onClick={() => setPendingApply({ mode: 'auto', changes: proposals })}
                                        disabled={isExecuting || !hasProposals}
                                        title={!hasProposals ? 'No changes suggested — your goals matched your week.' : undefined}
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
                                        disabled={isExecuting || !hasProposals}
                                        title={!hasProposals ? 'No changes suggested — your goals matched your week.' : undefined}
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
                        </motion.div>
                    )}

                    {!statsLoading && hasProposals && view === 'semi-auto' && (
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
                                    return (
                                        <div 
                                            key={change.goal_id}
                                            onClick={() => toggleChange(change.goal_id)}
                                            className={`p-5 rounded-2xl border cursor-pointer transition-all ${
                                                isApproved 
                                                    ? 'bg-[var(--glass-bg)] border-[var(--color-primary)]/50 shadow-lg shadow-[var(--color-primary)]/10' 
                                                    : 'bg-[var(--glass-bg)]/50 border-[var(--glass-border)] opacity-60'
                                            }`}
                                        >
                                            <div className="flex items-start gap-4">
                                                <div className="mt-1">
                                                    {isApproved ? (
                                                        <CheckCircle2 className="w-5 h-5 text-[var(--color-primary)]" />
                                                    ) : (
                                                        <Circle className="w-5 h-5 text-[var(--text-tertiary)]" />
                                                    )}
                                                </div>
                                                <div className="flex-1">
                                                    <h4 className="font-bold text-[var(--text-primary)] mb-1 flex items-center gap-2">
                                                        {change.title}
                                                        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--glass-bg)] border border-[var(--glass-border)]">
                                                            {change.change_type.replace('_', ' ')}
                                                        </span>
                                                    </h4>
                                                    <div className="flex items-center gap-3 text-sm font-medium my-3 p-3 bg-black/20 rounded-xl">
                                                        <span className="text-[var(--text-tertiary)] line-through">{change.old_value}</span>
                                                        <ArrowRight className="w-4 h-4 text-[var(--color-primary)]" />
                                                        <span className="text-[var(--text-primary)]">{change.new_value}</span>
                                                    </div>
                                                    <p className="text-sm text-[var(--text-secondary)] italic">
                                                        <ArrowDownRight className="inline w-3 h-3 mr-1 text-[var(--text-tertiary)]" />
                                                        {change.rationale}
                                                    </p>
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
