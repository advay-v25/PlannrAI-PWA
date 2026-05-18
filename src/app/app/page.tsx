'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { HomeLayout } from '@/components/home/home-layout';
import { StateHero } from '@/components/home/state-hero';
import { TimelineStrip } from '@/components/home/timeline-strip';
import { StacksModule } from '@/components/home/stacks-module';
import { BriefingModule } from '@/components/home/briefing-module';
import { InsightsCard } from '@/components/home/insights-card';
import { PrioritiesCard } from '@/components/home/priorities-card';
import { EnergyCheckin } from '@/components/home/energy-checkin';
import { AIProfileBadge } from '@/components/home/ai-profile-badge';
import { HomeTodos } from '@/components/home/home-todos';
import { ProgressBars } from '@/components/home/progress-bars';
import { PillarBalance } from '@/components/home/pillar-balance';
import { NotificationScheduler } from '@/components/home/notification-scheduler';
import { NextMoveCard } from '@/components/next-move';
import { useScheduleSync } from '@/hooks/use-schedule-sync';
import { apiClient } from '@/lib/api-client';
import { format } from 'date-fns';
import { Settings, Zap, Shield, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

export default function HomePage() {
    const router = useRouter();
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
    const [showWeeklyReviewPrompt, setShowWeeklyReviewPrompt] = useState(false);
    const [manualFeedback, setManualFeedback] = useState<string | null>(null);

    // Schedule Sync: Energy/Mood → Calendar mode banner
    const { currentMode, isReoptimizing, handleReoptimize, clearMode } = useScheduleSync({
        onCalendarRefresh: () => fetchHomeData(),
    });

    const fetchHomeData = async () => {
        try {
            const today = new Date().toISOString().split('T')[0];
            const timestamp = Date.now();
            const [summaryData, stateData, proactiveData] = await Promise.all([
                apiClient.get<any>(`/api/home/summary?date=${today}&t=${timestamp}`),
                apiClient.get<any>(`/api/home/state?date=${today}&t=${timestamp}`),
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

            // Check if Weekly Review should be prompted
            if (summaryData?.weekly_review_enabled !== false) {
                const dayOfWeek = new Date().getDay(); // 0 = Sunday
                if (dayOfWeek === 0) {
                    const dismissedAt = localStorage.getItem('weekly_review_dismissed');
                    const weekStartStr = format(new Date(), 'yyyy-ww'); // Crude week identifier
                    if (dismissedAt !== weekStartStr) {
                        setShowWeeklyReviewPrompt(true);
                    }
                }
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
        } catch (e) {
            console.error(e);
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

    const handleDismissWeeklyReview = () => {
        const weekStartStr = format(new Date(), 'yyyy-ww');
        localStorage.setItem('weekly_review_dismissed', weekStartStr);
        setShowWeeklyReviewPrompt(false);
    };

    const handleDismissManualFeedback = () => {
        localStorage.removeItem('manual_review_feedback');
        setManualFeedback(null);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center">
                {/* Neural Pulse Core */}
                <div className="relative w-24 h-24 mb-8">
                    <div className="absolute inset-0 bg-[var(--color-primary)] rounded-full blur-[40px] opacity-20 animate-pulse" />
                    <div className="absolute inset-0 border border-[var(--color-primary)] rounded-full opacity-40 animate-ping" />
                    <div className="absolute inset-4 border-2 border-[var(--color-primary)] rounded-full border-t-transparent animate-spin" />
                </div>
                
                {/* Sophisticated Text Loading */}
                <div className="space-y-4">
                    <h2 className="text-xl font-bold tracking-tight text-white animate-fade-in">
                        Plannr<span className="text-[var(--color-primary)]">AI</span>
                    </h2>
                    <div className="flex flex-col items-center gap-2">
                        <span className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] animate-pulse">
                            Synchronizing Neural Schedule
                        </span>
                        <div className="w-48 h-[1px] bg-white/5 relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[var(--color-primary)] to-transparent w-full animate-shimmer" />
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
                <h1 className="text-4xl font-bold text-white tracking-tight">Today</h1>
                <p className="text-sm text-white/40 font-mono mt-1">
                    {format(new Date(), 'EEEE, MMMM do')}
                </p>
            </div>
            <div className="flex items-center gap-4">
                <div className="hidden md:block text-right">
                    <div className="text-xs font-bold text-white/60">
                        {Math.round(effectiveData.metrics.completed_min / 60)}h {Math.round(effectiveData.metrics.completed_min % 60)}m DONE
                    </div>
                    <div className="text-[10px] text-white/30 uppercase tracking-widest">
                        {Math.round(effectiveData.metrics.planned_min / 60)}h {Math.round(effectiveData.metrics.planned_min % 60)}m PLANNED
                    </div>
                </div>
                <Link href="/app/settings">
                    <button className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors">
                        <Settings className="w-5 h-5" />
                    </button>
                </Link>
            </div>
        </div>
    );

    const today = new Date().toISOString().split('T')[0];

    return (
        <>
            <NotificationScheduler blocks={effectiveData.schedule_blocks} date={today} />

            {/* Scheduling Mode Banner (from energy check-in) */}
            {currentMode && currentMode.type && (
                <div className={`mb-6 rounded-2xl border p-4 flex items-center justify-between ${
                    currentMode.type === 'recovery'
                        ? 'bg-orange-500/10 border-orange-500/20'
                        : 'bg-emerald-500/10 border-emerald-500/20'
                }`}>
                    <div className="flex items-center gap-3">
                        {currentMode.type === 'recovery' ? (
                            <Shield className={`h-5 w-5 text-orange-400`} />
                        ) : (
                            <Zap className={`h-5 w-5 text-emerald-400`} />
                        )}
                        <div>
                            <h4 className={`font-bold text-sm ${
                                currentMode.type === 'recovery' ? 'text-orange-400' : 'text-emerald-400'
                            }`}>{currentMode.label}</h4>
                            <p className={`text-xs mt-0.5 ${
                                currentMode.type === 'recovery' ? 'text-orange-400/70' : 'text-emerald-400/70'
                            }`}>{currentMode.message}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={clearMode}
                            className="text-[10px] text-white/30 hover:text-white/60 transition-colors"
                        >Dismiss</button>
                        <button
                            onClick={handleReoptimize}
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

            {effectiveData.nextWeekPlanned === false && !showWeeklyReviewPrompt && (
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

            {showWeeklyReviewPrompt && (
                <div className="mb-6 bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-[var(--color-primary)]/20 rounded-full">
                            <span className="text-[var(--color-primary)] text-xl">📝</span>
                        </div>
                        <div>
                            <h4 className="text-[var(--color-primary)] font-bold text-sm">Time for your Weekly Review!</h4>
                            <p className="text-[var(--color-primary)]/70 text-xs mt-0.5">
                                Reflect on the past week and let AI regenerate your schedule with smart adjustments.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 w-full md:w-auto">
                        <button
                            onClick={handleDismissWeeklyReview}
                            className="flex-1 md:flex-none px-4 py-2 bg-white/5 text-white/60 text-xs font-bold rounded-lg hover:bg-white/10 transition-colors"
                        >
                            Not Now
                        </button>
                        <button
                            onClick={() => router.push('/app/weekly-review')}
                            className="flex-1 md:flex-none px-4 py-2 bg-[var(--color-primary)] text-white text-xs font-bold rounded-lg hover:brightness-110 shadow-lg shadow-[var(--color-primary)]/20 transition-all"
                        >
                            Start Review
                        </button>
                    </div>
                </div>
            )}

            {proactiveSuggestion && (
                <div className="mb-6 bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 rounded-2xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-[var(--color-primary)] text-xl">✨</span>
                        <div>
                            <h4 className="text-[var(--color-primary)] font-bold text-sm">{proactiveSuggestion.title}</h4>
                            <p className="text-[var(--color-primary)]/70 text-xs">{proactiveSuggestion.message}</p>
                        </div>
                    </div>
                    <button
                        onClick={() => {
                            if (proactiveSuggestion.id === 'no-schedule' || proactiveSuggestion.id === 'goal-sync-needed') {
                                router.push('/app/calendar?action=optimize_day');
                            } else {
                                router.push(`/app/coach?mode=strategic&prompt=${encodeURIComponent(proactiveSuggestion.message)}`);
                            }
                        }}
                        className="px-4 py-2 bg-[var(--color-primary)]/20 text-[var(--color-primary)] text-xs font-bold rounded-lg hover:bg-[var(--color-primary)]/30 transition-colors"
                    >
                        {proactiveSuggestion.action_label || 'Resolve'}
                    </button>
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
                                "{manualFeedback}"
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleDismissManualFeedback}
                        className="px-4 py-2 bg-white/5 text-white/60 text-xs font-bold rounded-lg hover:bg-white/10 transition-colors shrink-0"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            <HomeLayout
            header={header}
            progressBars={<ProgressBars daily={effectiveData.metrics} weekly={effectiveData.weekly_metrics} />}
            pillarBalance={<PillarBalance blocks={effectiveData.schedule_blocks} />}
            nowCard={
                <StateHero
                    state={effectiveState.state}
                    currentTime={effectiveState.current_time}
                    activeBlock={effectiveState.active_block}
                    nextBlock={effectiveState.next_block}
                    metrics={effectiveState.metrics}
                    insight={effectiveState.proactive_insight}
                    onAction={async (action) => {
                        console.log('Action Triggered:', action);
                        if (action === 'generate_schedule') {
                            handleGenerateSchedule();
                        } else if (action === 'optimize_day') {
                            router.push('/app/calendar');
                        } else if (action === 'reschedule_next') {
                            router.push('/app/calendar');
                        } else if (action === 'skip_next' || action === 'start_early') {
                            if (!effectiveState.next_block?.id) return;
                            const status = action === 'skip_next' ? 'cancelled' : 'in_progress';
                            toast.loading('Updating block...');
                            try {
                                await apiClient.post('/api/calendar/block-status', {
                                    block_id: effectiveState.next_block.id,
                                    status
                                });
                                toast.success(action === 'skip_next' ? 'Block skipped.' : 'Started early!');
                                handleRefresh();
                            } catch (e) {
                                toast.error('Failed to update block');
                            }
                        } else if (action === 'complete_early' || action === 'mark_incomplete') {
                            if (!effectiveState.active_block?.id) return;
                            const status = action === 'complete_early' ? 'done' : 'missed';
                            toast.loading('Updating block...');
                            try {
                                await apiClient.post('/api/calendar/block-status', {
                                    block_id: effectiveState.active_block.id,
                                    status
                                });
                                toast.success(action === 'complete_early' ? 'Block completed early! Great job.' : 'Block marked incomplete.');
                                handleRefresh();
                            } catch (e) {
                                toast.error('Failed to update block');
                            }
                        } else if (action === 'shift_schedule') {
                            router.push('/app/coach?mode=strategic&prompt=Reality%20Drift%3A%20I%20missed%20my%20last%20block.%20Shift%20the%20rest%20of%20my%20schedule%20back%20by%2030%20minutes.');
                        } else if (action === 'drop_block') {
                            if (!effectiveState.active_block?.id) {
                                router.push('/app/coach?mode=strategic&prompt=Reality%20Drift%3A%20Drop%20the%20missed%20block%20and%20continue%20the%20schedule.');
                                return;
                            }
                            toast.loading('Dropping block...');
                            try {
                                await apiClient.post('/api/calendar/block-status', {
                                    block_id: effectiveState.active_block.id,
                                    status: 'missed'
                                });
                                toast.success('Block dropped. Schedule continues.');
                                handleRefresh();
                            } catch (e) {
                                toast.error('Failed to update block');
                            }
                        } else {
                            handleRefresh();
                        }
                    }}
                />
            }
            timeline={
                <TimelineStrip
                    blocks={effectiveData.schedule_blocks}
                    anchors={effectiveData.anchors}
                />
            }
            energyCheckin={
                <EnergyCheckin
                    currentEnergy={effectiveData.user_state?.energy_level > 0 ? effectiveData.user_state.energy_level : undefined}
                    currentMood={effectiveData.user_state?.emotional_state !== 'neutral' ? effectiveData.user_state.emotional_state : undefined}
                    onCheckin={handleEnergyCheckin}
                />
            }
            briefing={
                <BriefingModule
                    briefing={briefing}
                    isLoading={briefingLoading}
                    onGenerate={handleGenerateBriefing}
                />
            }
            priorities={
                priorities.length > 0 ? (
                    <PrioritiesCard
                        priorities={priorities}
                        tone={briefingTone}
                    />
                ) : undefined
            }
            todos={<HomeTodos />}
            aiProfile={
                effectiveData.ai_profile ? (
                    <AIProfileBadge aiProfile={effectiveData.ai_profile} />
                ) : undefined
            }
            insights={
                <InsightsCard
                    userState={effectiveData.user_state}
                    insight={effectiveData.insight}
                />
            }
            stacks={
                <StacksModule
                    stacks={effectiveData.habit_stacks}
                    onUpdate={handleRefresh}
                />
            }
            nextMove={<NextMoveCard />}
            />
        </>
    );
}
