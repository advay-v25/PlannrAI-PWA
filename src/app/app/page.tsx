'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { HomeLayout } from '@/components/home/home-layout';
import { CommandCenter } from '@/components/home/command-center';
import { DashboardCards } from '@/components/home/dashboard-cards';
import { LinearTimeline } from '@/components/home/linear-timeline';
import { ProgressBars } from '@/components/home/progress-bars';
import { PillarBalance } from '@/components/home/pillar-balance';
import { EnergyCheckin } from '@/components/home/energy-checkin';
import { useScheduleSync } from '@/hooks/use-schedule-sync';
import { apiClient } from '@/lib/api-client';
import { format } from 'date-fns';
import { Settings, Zap, Shield, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { PageBackground } from '@/components/ui/PageBackground';
import { motion } from 'framer-motion';
import { useUserStore } from '@/stores';
import { NotificationScheduler } from '@/components/home/notification-scheduler';
import { DaySweep } from '@/components/home/day-sweep';

export default function HomePage() {
    const router = useRouter();
    const { profile } = useUserStore();
    const [data, setData] = useState<any>(null);
    const [stateData, setStateData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [briefing, setBriefing] = useState<string | undefined>(undefined);
    const [briefingTone, setBriefingTone] = useState<string | undefined>(undefined);
    const [priorities, setPriorities] = useState<string[]>([]);
    const [briefingLoading, setBriefingLoading] = useState(false);
    const [generating, setGenerating] = useState(false);

    const briefingAttempted = useRef(false);

    const [proactiveSuggestion, setProactiveSuggestion] = useState<any>(null);
    const [manualFeedback, setManualFeedback] = useState<string | null>(null);

    const isPreview = process.env.NEXT_PUBLIC_IS_PREVIEW_BUILD === 'true';

    // Schedule Sync: Energy/Mood → Calendar mode banner
    const { currentMode, isReoptimizing, handleReoptimize, clearMode } = useScheduleSync({
        onCalendarRefresh: () => fetchHomeData(),
    });

    const fetchHomeData = async () => {
        try {
            const { format } = await import('date-fns');
            const today = format(new Date(), 'yyyy-MM-dd');
            const timestamp = Date.now();
            const [summaryData, stateData, proactiveData] = await Promise.all([
                apiClient.get<any>(`/api/home/summary?date=${today}&t=${timestamp}`).catch(e => { console.error('Summary error:', e); return null; }),
                apiClient.get<any>(`/api/home/state?date=${today}&t=${timestamp}`).catch(e => { console.error('State error:', e); return null; }),
                apiClient.coach.getProactiveSuggestion().catch(() => null)
            ]);

            if (summaryData) {
                setData(summaryData);
                if (summaryData.briefing) setBriefing(summaryData.briefing);
            }
            if (stateData) {
                setStateData(stateData);
            }
            if (proactiveData && proactiveData.has_suggestion) {
                setProactiveSuggestion(proactiveData.suggestion);
            }


        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHomeData();
        const storedFeedback = localStorage.getItem('manual_review_feedback');
        if (storedFeedback) {
            setManualFeedback(storedFeedback);
        }

        const handleFocus = () => {
            fetchHomeData();
        };
        window.addEventListener('focus', handleFocus);
        return () => window.removeEventListener('focus', handleFocus);
    }, []);

    // Auto-fire briefing if missing and data loaded
    useEffect(() => {
        if (!loading && data && !briefing && !briefingAttempted.current) {
            handleGenerateBriefing();
        }
    }, [loading, data, briefing]);

    // NOTE: needs_rescheduling is now handled via the proactive coach suggestion banner.
    // Removed auto-redirect to prevent UX conflict with the suggestion UI.

    const handleRefresh = () => {
        fetchHomeData();
        // Cross-feature: Also refresh the global goals store so progress bars update instantly in Coach Hub
        import('@/stores').then(({ useGoalsStore }) => {
            import('@/lib/api-client').then(({ apiClient }) => {
                apiClient.get('/api/goals').then((data: any) => {
                    if (data?.goals) {
                        useGoalsStore.getState().setGoals(data.goals);
                    }
                }).catch(console.error);
            });
        });
    };

    const handleGenerateBriefing = async () => {
        setBriefingLoading(true);
        briefingAttempted.current = true;
        try {
            const result = await apiClient.post<any>('/api/narrative/briefing', {
                date: new Date().toISOString().split('T')[0]
            });
            
            setBriefing(result?.briefing || 'Systems online.');
            setBriefingTone(result?.tone || 'focused');
            setPriorities(result?.priorities || []);
        } catch (e: any) {
            console.warn('[Briefing] Skipped or rate-limited:', e.message || e);
            setBriefing('Systems ready.');
        } finally {
            setBriefingLoading(false);
        }
    };

    const handleEnergyCheckin = async (energy: number, mood: string) => {
        try {
            await apiClient.post<any>('/api/home/energy-checkin', {
                energy_level: energy,
                emotional_state: mood
            });
            // Update local data immediately
            setData((prev: any) => prev ? {
                ...prev,
                user_state: { ...prev.user_state, energy_level: energy, emotional_state: mood }
            } : prev);
        } catch (e) {
            console.error('Energy checkin failed:', e);
            toast.error('Failed to save check-in');
        }
    };

    const handleGenerateSchedule = async () => {
        router.push('/app/calendar?action=optimize_day');
    };



    const handleDismissManualFeedback = () => {
        localStorage.removeItem('manual_review_feedback');
        setManualFeedback(null);
    };

    if (loading) {
        return (
            <div className="h-screen h-dvh bg-[var(--color-bg-primary)] text-[var(--text-primary)] flex flex-col items-center justify-center p-6 relative overflow-hidden font-mono">
                {/* Immersive background glow */}
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(168,85,247,0.08)_0%,transparent_60%)]" />
                
                {/* Boot Sequence Container */}
                <div className="relative z-10 w-full max-w-md flex flex-col items-center">
                    {/* Sci-fi Orb Core */}
                    <div className="relative w-32 h-32 mb-10 flex items-center justify-center">
                        <div className="absolute inset-0 bg-orange-500 rounded-full blur-[50px] opacity-20 animate-pulse" />
                        <div className="absolute inset-2 border-[1px] border-orange-500/30 rounded-full opacity-60 animate-ping" style={{ animationDuration: '3s' }} />
                        <div className="absolute inset-6 border-[2px] border-l-orange-500 border-r-purple-500 border-t-transparent border-b-transparent rounded-full animate-spin" style={{ animationDuration: '2s' }} />
                        <div className="absolute inset-10 border-[1px] border-purple-500/50 border-t-transparent rounded-full animate-spin" style={{ animationDuration: '1.5s', animationDirection: 'reverse' }} />
                        <div className="w-4 h-4 bg-[var(--text-primary)] rounded-full shadow-[0_0_20px_rgba(255,255,255,0.5)] dark:shadow-[0_0_20px_rgba(255,255,255,1)] animate-pulse" />
                    </div>
                    
                    {/* Boot Logs */}
                    <div className="w-full bg-[var(--glass-bg)] backdrop-blur-md border border-[var(--glass-border)] p-5 rounded-lg shadow-2xl relative">
                        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-orange-500/50 to-transparent" />
                        
                        <div className="flex items-center justify-between mb-4 pb-2 border-b border-[var(--glass-border)]">
                            <h2 className="text-sm font-bold tracking-[0.2em] text-[var(--text-secondary)]">
                                PLANNRAI <span className="text-orange-500">OS</span>
                            </h2>
                            <span className="text-[10px] text-orange-500/70 animate-pulse">V2.5.0</span>
                        </div>
                        
                        <div className="space-y-2 text-[11px] text-[var(--text-secondary)] tracking-wider h-[80px]">
                            <div className="flex items-center gap-2">
                                <span className="text-purple-400">SYS</span>
                                <span className="animate-fade-in text-[var(--text-secondary)]">Establishing neural link...</span>
                            </div>
                            <div className="flex items-center gap-2" style={{ animationDelay: '0.4s' }}>
                                <span className="text-orange-400">SYNC</span>
                                <span className="animate-fade-in opacity-0" style={{ animationDelay: '0.4s', animationFillMode: 'forwards' }}>Loading timeline anchors...</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-emerald-400 opacity-0 animate-fade-in" style={{ animationDelay: '0.8s', animationFillMode: 'forwards' }}>OPT</span>
                                <span className="animate-fade-in opacity-0" style={{ animationDelay: '0.8s', animationFillMode: 'forwards' }}>Optimizing schedule matrix...</span>
                            </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="mt-4 h-[2px] w-full bg-[var(--glass-bg)] rounded-full overflow-hidden">
                            <motion.div 
                                className="h-full bg-gradient-to-r from-purple-500 to-orange-500"
                                initial={{ width: 0 }}
                                animate={{ width: "100%" }}
                                transition={{ duration: 1.5, ease: "easeInOut" }}
                            />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Safe defaults if APIs fail
    const effectiveData = data || {
        schedule_blocks: [],
        anchors: [],
        habit_stacks: [],
        metrics: { planned_min: 0, completed_min: 0, free_min: 1440 },
        weekly_metrics: { planned_min: 0, completed_min: 0 },
        user_state: { energy_level: 5, emotional_state: 'neutral' },
        ai_profile: null,
        insight: { text: 'Welcome to PlannrAI', type: 'neutral' },
        next_up: null,
    };
    const effectiveState = stateData || {
        state: 'NO_SCHEDULE',
        current_time: new Date().toTimeString().slice(0, 5),
        active_block: null,
        next_block: null,
        metrics: { time_remaining_in_block: null, time_until_next_block: null },
        proactive_insight: 'Plan your day or let AI generate a schedule.',
    };

    // Header Content
    const header = (
        <div className="flex items-center justify-between">
            <div>
                <div className="flex items-center gap-3">
                    <h1 className="text-4xl font-bold text-[var(--text-primary)] tracking-tight">Today</h1>
                    <span className="w-2 h-2 rounded-full bg-orange-500 animate-scifi-blink mt-2" />
                </div>
                <p className="text-sm text-[var(--text-tertiary)] font-mono mt-1">
                    {format(new Date(), 'EEEE, MMMM do')}
                </p>
            </div>
            <div className="flex items-center gap-4">
                <div className="hidden md:block text-right">
                    <div className="text-xs font-bold text-[var(--text-secondary)]">
                        {Math.round(effectiveData.metrics.completed_min / 60)}<span className="lowercase">h</span> {Math.round(effectiveData.metrics.completed_min % 60)}<span className="lowercase">m</span> <span className="uppercase">DONE</span>
                    </div>
                    <div className="text-[10px] text-[var(--text-tertiary)] tracking-widest">
                        {Math.round(effectiveData.metrics.planned_min / 60)}<span className="lowercase">h</span> {Math.round(effectiveData.metrics.planned_min % 60)}<span className="lowercase">m</span> <span className="uppercase">PLANNED</span>
                    </div>
                </div>
                <Link href="/app/settings">
                    <button className="p-2 rounded-full bg-[var(--glass-bg)] hover:bg-[var(--glass-bg)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                        <Settings className="w-5 h-5" />
                    </button>
                </Link>
            </div>
        </div>
    );

    const today = new Date().toISOString().split('T')[0];

    return (
        <>
            <PageBackground variant="aurora" intensity="strong" />

            {/* Geometric accent layer */}
            <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none', overflow: 'hidden' }}>
              {/* Top shimmer accent line */}
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
                background: 'linear-gradient(to right, transparent, hsla(16, 100%, 60%, 0.45) 30%, hsla(270, 91%, 65%, 0.45) 55%, hsla(158, 84%, 45%, 0.38) 75%, transparent)',
              }} />
              {/* Top-left corner cross */}
              <div style={{ position: 'absolute', top: '72px', left: '12px', opacity: 0.08 }}>
                <div style={{ position: 'absolute', width: '1px', height: '20px', background: 'var(--text-primary)', left: '9px', top: 0 }} />
                <div style={{ position: 'absolute', height: '1px', width: '20px', background: 'var(--text-primary)', top: '9px', left: 0 }} />
              </div>
              {/* Top-right corner cross */}
              <div style={{ position: 'absolute', top: '72px', right: '12px', opacity: 0.08 }}>
                <div style={{ position: 'absolute', width: '1px', height: '20px', background: 'var(--text-primary)', left: '9px', top: 0 }} />
                <div style={{ position: 'absolute', height: '1px', width: '20px', background: 'var(--text-primary)', top: '9px', left: 0 }} />
              </div>
              {/* Faint bottom vignette */}
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, height: '200px',
                background: 'linear-gradient(to top, var(--color-bg-primary), transparent)',
              }} />
            </div>
            <NotificationScheduler blocks={effectiveData.schedule_blocks} date={today} />

            {/* End-of-day completion sweep — the only place block status ever
                gets collected. Dismissible, never blocking. */}
            <DaySweep unmarked={stateData?.unmarked ?? null} onMarked={handleRefresh} />

            {/* Scheduling Mode Banner (from energy check-in) */}
            {currentMode && currentMode.type && (
                <div className={`mb-6 rounded-2xl border p-4 flex items-center justify-between ${
                    currentMode.type === 'recovery'
                        ? 'bg-orange-500/15 border-orange-500/30 dark:bg-orange-500/10 dark:border-orange-500/20'
                        : 'bg-emerald-500/15 border-emerald-500/30 dark:bg-emerald-500/10 dark:border-emerald-500/20'
                }`}>
                    <div className="flex items-center gap-3">
                        {currentMode.type === 'recovery' ? (
                            <Shield className={`h-5 w-5 text-orange-600 dark:text-orange-400`} />
                        ) : (
                            <Zap className={`h-5 w-5 text-emerald-600 dark:text-emerald-400`} />
                        )}
                        <div>
                            <h4 className={`font-bold text-sm ${
                                currentMode.type === 'recovery' ? 'text-orange-700 dark:text-orange-400' : 'text-emerald-700 dark:text-emerald-400'
                            }`}>{currentMode.label}</h4>
                            <p className={`text-xs mt-0.5 ${
                                currentMode.type === 'recovery' ? 'text-orange-600 dark:text-orange-400/70' : 'text-emerald-600 dark:text-emerald-400/70'
                            }`}>{currentMode.message}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={clearMode}
                            className="text-[10px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
                        >Dismiss</button>
                        {currentMode.type === 'momentum' && (
                            <button
                                onClick={() => {
                                    router.push('/app/calendar');
                                }}
                                className="px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 bg-[var(--glass-bg)] text-[var(--text-secondary)] dark:text-white/80 hover:bg-[var(--glass-bg-hover)] dark:hover:bg-white/[0.16]"
                            >
                                Maintain Schedule
                            </button>
                        )}
                        <button
                            onClick={() => {
                                if (currentMode.type === 'recovery') {
                                    router.push('/app/coach?context=reduce_today_load');
                                } else {
                                    router.push('/app/coach?context=do_more_today');
                                }
                            }}
                            disabled={isReoptimizing}
                            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
                                currentMode.type === 'recovery'
                                    ? 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30'
                                    : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                            }`}
                        >
                            <RefreshCw className={`h-3 w-3 ${isReoptimizing ? 'animate-spin' : ''}`} />
                            {isReoptimizing ? 'Optimizing...' : currentMode.actionLabel}
                        </button>
                    </div>
                </div>
            )}

            {effectiveData.nextWeekPlanned === false && (
                <div className="mb-6 bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-orange-400 text-xl">⚠️</span>
                        <div>
                            <h4 className="text-orange-400 font-bold text-sm">Next Week Not Planned</h4>
                            <p className="text-orange-400/70 text-xs">Your calendar is empty for next week.</p>
                        </div>
                    </div>
                    <button
                        onClick={() => router.push('/app/calendar')}
                        className="px-4 py-2 bg-orange-500/20 text-orange-400 text-xs font-bold rounded-lg hover:bg-orange-500/30 transition-colors"
                    >
                        Plan Now
                    </button>
                </div>
            )}



            {proactiveSuggestion && (
                <div className="mb-6 bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <span className="text-[var(--color-primary)] text-xl">✨</span>
                        <div>
                            <h4 className="text-[var(--color-primary)] font-bold text-sm">{proactiveSuggestion.title}</h4>
                            <p className="text-[var(--color-primary)]/70 text-xs">{proactiveSuggestion.message}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 w-full md:w-auto">
                        <button
                            onClick={async () => {
                                setProactiveSuggestion(null);
                                if (proactiveSuggestion.dismiss_uid) {
                                    await apiClient.post('/api/coach/dismiss', { suggestion_id: proactiveSuggestion.dismiss_uid }).catch(console.error);
                                }
                            }}
                            className="flex-1 md:flex-none px-4 py-2 bg-[var(--glass-bg)] text-[var(--text-secondary)] text-xs font-bold rounded-lg hover:bg-[var(--glass-bg)] transition-colors"
                        >
                            Dismiss
                        </button>
                        <button
                            onClick={() => {
                                if (proactiveSuggestion.id === 'no-schedule' || proactiveSuggestion.id === 'goal-sync-needed') {
                                    router.push('/app/calendar?action=optimize_day');
                                } else if (proactiveSuggestion.id === 'missed-blocks') {
                                    router.push('/app/coach?context=fix_today_schedule');
                                } else if (proactiveSuggestion.action_label === 'Boost Schedule') {
                                    router.push('/app/coach?context=do_more_today');
                                } else {
                                    router.push(`/app/coach?mode=strategic&prompt=${encodeURIComponent(proactiveSuggestion.query || proactiveSuggestion.message)}`);
                                }
                            }}
                            className="flex-1 md:flex-none px-4 py-2 bg-[var(--color-primary)] text-[var(--text-primary)] text-xs font-bold rounded-lg hover:brightness-110 shadow-lg shadow-[var(--color-primary)]/20 transition-all"
                        >
                            {proactiveSuggestion.action_label || 'Resolve'}
                        </button>
                    </div>
                </div>
            )}

            {manualFeedback && (
                <div className="mb-6 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <div className="p-2 bg-emerald-500/20 rounded-full mt-1">
                            <span className="text-emerald-500 text-xl">📝</span>
                        </div>
                        <div>
                            <h4 className="text-emerald-500 font-bold text-sm">Weekly Review Notes</h4>
                            <p className="text-emerald-500/70 text-xs mt-1 italic max-w-lg">
                            &ldquo;{manualFeedback}&rdquo;
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleDismissManualFeedback}
                        className="px-4 py-2 bg-[var(--glass-bg)] text-[var(--text-secondary)] text-xs font-bold rounded-lg hover:bg-[var(--glass-bg)] transition-colors shrink-0"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            <HomeLayout
                header={header}
                commandCenter={
                    <CommandCenter
                        userName={profile?.full_name || undefined}
                        plannedMinutes={effectiveData.metrics?.planned_min || 0}
                        unscheduledMinutes={effectiveData.metrics?.free_min || 1440}
                        overdueCount={effectiveData.metrics?.overdue_count || 0}
                        state={effectiveState.state}
                        activeBlock={effectiveState.active_block}
                        nextBlock={effectiveState.next_block}
                        timeRemaining={effectiveState.metrics?.time_remaining_in_block ?? null}
                        timeUntilNext={effectiveState.metrics?.time_until_next_block ?? null}
                        isLoading={loading || briefingLoading}
                        onAction={async (action, payload) => {
                            if (action === 'generate_schedule') {
                                handleGenerateSchedule();
                            } else if (action === 'next_move') {
                                router.push('/app/coach?mode=strategic');
                            } else if (action === 'mark_done' || action === 'mark_incomplete') {
                                const block = payload;
                                if (!block?.id) return;
                                const status = action === 'mark_done' ? 'done' : 'missed';
                                
                                // Optimistic UI Update
                                setStateData((prev: any) => {
                                    if (!prev) return prev;
                                    return {
                                        ...prev,
                                        active_block: null,
                                        state: 'BETWEEN_BLOCKS'
                                    };
                                });
                                // Optimistically update metrics
                                setData((prev: any) => {
                                    if (!prev) return prev;
                                    const bDuration = 30; // Just guess 30 for optimistic if we don't calculate exact
                                    return {
                                        ...prev,
                                        metrics: {
                                            ...prev.metrics,
                                            completed_min: action === 'mark_done' 
                                                ? (prev.metrics?.completed_min || 0) + bDuration 
                                                : (prev.metrics?.completed_min || 0)
                                        }
                                    };
                                });

                                toast.loading('Updating...', { id: 'block-status' });
                                try {
                                    await apiClient.post('/api/calendar/block-status', {
                                        block_id: block.id,
                                        status
                                    });
                                    toast.success(action === 'mark_done' ? 'Done!' : 'Marked incomplete', { id: 'block-status' });
                                    handleRefresh();
                                } catch (e) {
                                    toast.error('Failed to update block', { id: 'block-status' });
                                    handleRefresh(); // Revert
                                }
                            } else {
                                handleRefresh();
                            }
                        }}
                    />
                }
                energyCheckin={
                    <EnergyCheckin
                        currentEnergy={effectiveData.user_state?.energy_level > 0 ? effectiveData.user_state.energy_level : undefined}
                        currentMood={effectiveData.user_state?.emotional_state !== 'neutral' ? effectiveData.user_state.emotional_state : undefined}
                        onCheckin={handleEnergyCheckin}
                    />
                }
                dashboardCards={
                    <DashboardCards
                        goals={effectiveData.goals || []}
                        insight={effectiveData.insight?.text || briefing || effectiveState.proactive_insight}
                        topTask={effectiveData.top_task}
                        isPreview={isPreview}
                    />
                }
                timeline={
                    <LinearTimeline 
                        blocks={effectiveData.schedule_blocks}
                        onStatusChange={async (blockId: string, status: string) => {
                            toast.loading('Updating block...', { id: 'block-status' });
                            try {
                                await apiClient.post('/api/calendar/block-status', { block_id: blockId, status });
                                toast.success('Block updated', { id: 'block-status' });
                                handleRefresh();
                            } catch (e) {
                                toast.error('Failed to update block', { id: 'block-status' });
                            }
                        }}
                    />
                }
                insights={
                    <div className="flex flex-col gap-6">
                        <PillarBalance blocks={effectiveData.schedule_blocks} />
                        <ProgressBars daily={effectiveData.metrics} weekly={effectiveData.weekly_metrics} />
                    </div>
                }
            />
        </>
    );
}
