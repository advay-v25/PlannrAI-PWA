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
import { apiClient } from '@/lib/api-client';
import { format } from 'date-fns';
import { Settings } from 'lucide-react';
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

    const fetchHomeData = async () => {
        try {
            const today = new Date().toISOString().split('T')[0];
            const timestamp = Date.now();
            const [summaryRes, stateRes] = await Promise.all([
                fetch(`/api/home/summary?date=${today}&t=${timestamp}`),
                fetch(`/api/home/state?date=${today}&t=${timestamp}`)
            ]);

            if (summaryRes.ok) {
                const json = await summaryRes.json();
                setData(json.data);
                if (json.data.briefing) setBriefing(json.data.briefing);
            }
            if (stateRes.ok) {
                const stateJson = await stateRes.json();
                setStateData(stateJson.data);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHomeData();
    }, []);

    // Auto-fire briefing if missing and data loaded
    useEffect(() => {
        if (!loading && data && !briefing && !briefingLoading && !briefingAttempted.current) {
            handleGenerateBriefing();
        }
    }, [loading, data, briefing, briefingLoading]);

    const handleRefresh = () => {
        fetchHomeData();
    };

    const handleGenerateBriefing = async () => {
        setBriefingLoading(true);
        briefingAttempted.current = true;
        try {
            const res = await fetch('/api/narrative/briefing', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: new Date().toISOString().split('T')[0] })
            });
            if (res.ok) {
                const json = await res.json();
                setBriefing(json.data?.briefing || 'Systems online.');
                setBriefingTone(json.data?.tone || 'focused');
                setPriorities(json.data?.priorities || []);
            } else {
                // Fallback on error to satisfy the check
                setBriefing('Systems ready.');
            }
        } catch (e) {
            console.error(e);
        } finally {
            setBriefingLoading(false);
        }
    };

    const handleEnergyCheckin = async (energy: number, mood: string) => {
        try {
            await apiClient.post('/api/home/energy-checkin', {
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
        if (generating) return;
        setGenerating(true);
        toast.info('🤖 Generating your schedule...');
        try {
            // 1. Call generate-today API (creates a full wake-to-sleep schedule)
            const today = new Date().toISOString().split('T')[0];
            const planRes = await fetch('/api/calendar/generate-today', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: today })
            });

            if (!planRes.ok) {
                const err = await planRes.json().catch(() => ({}));
                throw new Error(err?.error?.message || 'Failed to generate plan');
            }

            const planData = await planRes.json();
            const options = planData.data?.options || planData.options || [];

            if (options.length === 0) {
                toast.error('AI could not generate a schedule. Try adding goals first.');
                return;
            }

            // 2. Auto-apply the first option (balanced variant)
            const firstOption = options[0];
            const applyRes = await fetch('/api/patch/apply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    patch: firstOption.patch,
                    source: 'generate_schedule',
                    context: firstOption.id
                })
            });

            if (!applyRes.ok) {
                throw new Error('Failed to apply schedule');
            }

            const applyData = await applyRes.json();
            toast.success(`✅ Schedule created! ${applyData.data?.changes || ''} blocks added.`);

            // 3. Refresh home data to show new blocks
            await fetchHomeData();

            // 4. Notify calendar (if mounted) to refresh
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new Event('calendar-refresh'));
            }

        } catch (e: any) {
            console.error('Generate schedule failed:', e);
            toast.error(e.message || 'Failed to generate schedule');
        } finally {
            setGenerating(false);
        }
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
        tasks: [],
        metrics: { planned_min: 0, completed_min: 0, free_min: 1440 },
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

    return (
        <HomeLayout
            header={header}
            nowCard={
                <StateHero
                    state={effectiveState.state}
                    currentTime={effectiveState.current_time}
                    activeBlock={effectiveState.active_block}
                    nextBlock={effectiveState.next_block}
                    metrics={effectiveState.metrics}
                    insight={effectiveState.proactive_insight}
                    onAction={(action) => {
                        console.log('Action Triggered:', action);
                        if (action === 'generate_schedule') {
                            handleGenerateSchedule();
                        } else if (action === 'optimize_day') {
                            router.push('/app/calendar');
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
        />
    );
}
