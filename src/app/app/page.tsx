'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { useUserStore, useGoalsStore, useDailyLogStore } from '@/stores';
import { useToast } from '@/components/ui/toast';

// V3 Components
import { AmbientPulse } from '@/components/dashboard/ambient-pulse';
import { FocusCompass } from '@/components/dashboard/focus-compass';
import { TimelineStrip } from '@/components/dashboard/timeline-strip';
import { PillarBalance } from '@/components/dashboard/pillar-balance';
import { RealityIntake } from '@/components/dashboard/reality-intake';
import { EnergyGauge } from '@/components/ui/energy-gauge';
import { WisdomFeed } from '@/components/dashboard/wisdom-feed';

// Existing Components
import { GlassCard } from '@/components/ui/glass-card';
import { InterventionCard } from '@/components/dashboard/intervention-card';
import { MorningBriefing } from '@/components/dashboard/morning-briefing';
import { HabitStacksList } from '@/components/habit-stacks';
import { checkInterventionsAction } from '@/app/actions/interventions';
import { AnticipationBanner } from '@/components/dashboard/anticipation-banner';
import { IntelligenceHeartbeat } from '@/components/dashboard/intelligence-heartbeat';
import { getOptimizationContextAction } from '@/app/actions/intelligence';
import type { OptimizationContext } from '@/lib/intelligence/context-engine';

import { formatDate, getGreeting } from '@/lib/utils';
import type { ScheduleBlock, InterventionLog, Goal } from '@/types/database';
import { WeekPlanner, PlanWeekFAB } from '@/components/week-planner';

export default function HomePage() {
    const supabase = createClient();
    const { profile, setProfile, updateProfile } = useUserStore();
    const { goals, setGoals } = useGoalsStore();
    const { todayLog, setTodayLog } = useDailyLogStore();
    const { showToast } = useToast();
    const [isLoading, setIsLoading] = useState(true);

    // Extended type for blocks with joined goal
    type ScheduleBlockWithGoal = ScheduleBlock & { goal?: Goal };
    const [todayBlocks, setTodayBlocks] = useState<ScheduleBlockWithGoal[]>([]);
    const [activeIntervention, setActiveIntervention] = useState<InterventionLog | null>(null);
    const [anticipationSignal, setAnticipationSignal] = useState<import('@/lib/intelligence/anticipation-service').AnticipationSignal | null>(null);
    const [intelContext, setIntelContext] = useState<OptimizationContext | null>(null);
    const [isSyncingIntel, setIsSyncingIntel] = useState(false);
    const [showWeekPlanner, setShowWeekPlanner] = useState(false);

    useEffect(() => {
        async function loadData() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Load profile
            const { data: profileData } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();
            if (profileData) setProfile(profileData);

            // Load goals
            const { data: goalsData } = await supabase
                .from('goals')
                .select('*')
                .eq('user_id', user.id)
                .eq('is_paused', false);
            if (goalsData) setGoals(goalsData);

            // Load today's blocks
            const today = new Date().toISOString().split('T')[0];
            const { data: blocksData } = await supabase
                .from('schedule_blocks')
                .select('*, goal:goals(*)')
                .eq('user_id', user.id)
                .eq('date', today)
                .order('start_time', { ascending: true });
            if (blocksData) setTodayBlocks(blocksData);

            // Check if energy already logged today
            const { data: logData } = await supabase
                .from('daily_logs')
                .select('*')
                .eq('user_id', user.id)
                .eq('log_date', today)
                .maybeSingle();
            if (logData) {
                setTodayLog({
                    energy_level: logData.energy_level,
                    mood: logData.mood || '',
                    wins: logData.wins || [],
                    challenges: logData.challenges || [],
                });
            }

            // Check for proactive interventions
            try {
                const nudge = await checkInterventionsAction(user.id);
                if (nudge) setActiveIntervention(nudge);
            } catch (err) {
                console.error('Intervention check failed', err);
            }

            // Check Anticipation (Silent Intelligence)
            try {
                const { checkAnticipation } = await import('@/app/actions/anticipation');
                const signal = await checkAnticipation(user.id);
                if (signal) setAnticipationSignal(signal);
            } catch (err) {
                console.error('Anticipation check failed', err);
            }

            // Fetch Intelligence Context (Heartbeat)
            try {
                setIsSyncingIntel(true);
                const intel = await getOptimizationContextAction(user.id);
                if (intel) setIntelContext(intel);
            } catch (err) {
                console.error('Intelligence context fetch failed', err);
            } finally {
                setIsSyncingIntel(false);
            }

            setIsLoading(false);
        }
        loadData();
    }, [supabase, setProfile, setGoals, setTodayLog]);

    // Post-Onboarding Signal
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            if (params.get('setup') === 'complete') {
                window.history.replaceState(null, '', '/app');
                showToast(
                    "System Baselined",
                    'ai',
                    5000,
                    <span className="text-xs text-[var(--text-tertiary)] block pt-1">
                        I will observe and adapt strategy as we go.
                    </span>
                );
            }
        }
    }, [showToast]);

    const handleEnergySet = async (level: number) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const today = new Date().toISOString().split('T')[0];
        await supabase.from('daily_logs').upsert({
            user_id: user.id,
            log_date: today,
            energy_level: level,
        }, { onConflict: 'user_id,log_date' });

        setTodayLog({
            energy_level: level,
            mood: todayLog?.mood || '',
            wins: todayLog?.wins || [],
            challenges: todayLog?.challenges || []
        });

        // Auto-enable low energy mode if very low
        if (level <= 2 && !profile?.low_energy_mode) {
            updateProfile({ low_energy_mode: true });
            await supabase.from('profiles').update({ low_energy_mode: true }).eq('id', user.id);
        }
    };

    const refreshBlocks = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const today = new Date().toISOString().split('T')[0];
        const { data: blocksData } = await supabase
            .from('schedule_blocks')
            .select('*, goal:goals(*)')
            .eq('user_id', user.id)
            .eq('date', today)
            .order('start_time', { ascending: true });
        if (blocksData) setTodayBlocks(blocksData);
    };

    const handleCompleteBlock = async (id: string) => {
        setTodayBlocks(prev => prev.map(b => b.id === id ? { ...b, status: 'done' } : b));
        await supabase.from('schedule_blocks').update({ status: 'done' }).eq('id', id);
    };

    // Calculate Pillar Balance
    const plannedByPillar = { mind: 0, body: 0, craft: 0 };
    const completedByPillar = { mind: 0, body: 0, craft: 0 };

    goals.forEach(g => {
        if (g.category in plannedByPillar) {
            plannedByPillar[g.category as keyof typeof plannedByPillar] += (g.minutes_per_day || 0);
        }
    });

    todayBlocks.filter(b => b.status === 'done' && b.goal?.category).forEach(b => {
        if (b.goal && b.goal.category in completedByPillar) {
            const duration = (new Date(`1970-01-01T${b.end_time}`).getTime() - new Date(`1970-01-01T${b.start_time}`).getTime()) / 60000;
            completedByPillar[b.goal.category as keyof typeof completedByPillar] += duration;
        }
    });

    // Today's progress
    const plannedMinutes = todayBlocks.reduce((sum, b) => {
        const start = new Date(`1970-01-01T${b.start_time}`);
        const end = new Date(`1970-01-01T${b.end_time}`);
        return sum + (end.getTime() - start.getTime()) / 60000;
    }, 0);
    const completedMinutes = todayBlocks.filter(b => b.status === 'done').reduce((sum, b) => {
        const start = new Date(`1970-01-01T${b.start_time}`);
        const end = new Date(`1970-01-01T${b.end_time}`);
        return sum + (end.getTime() - start.getTime()) / 60000;
    }, 0);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <>
            {/* Dynamic Ambient Background */}
            <AmbientPulse
                energyLevel={todayLog?.energy_level || 3}
                isActive={todayBlocks.some(b => {
                    const now = new Date();
                    const start = new Date(`${b.date}T${b.start_time}`);
                    const end = new Date(`${b.date}T${b.end_time}`);
                    return now >= start && now < end && b.status !== 'done';
                })}
            />

            <div className="relative z-10 space-y-8 pb-32">
                {/* Minimal Header */}
                <header className="pt-6 pb-2">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center justify-between"
                    >
                        <div>
                            <p className="text-[10px] tracking-[0.3em] uppercase text-[var(--text-tertiary)]">
                                {formatDate(new Date())}
                            </p>
                            <h1 className="text-2xl font-bold mt-1">
                                {getGreeting()}, <span className="text-gradient">{profile?.preferred_name || profile?.full_name?.split(' ')[0] || 'Friend'}</span>
                            </h1>
                        </div>

                        {/* Energy Badge */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                        >
                            <EnergyGauge level={todayLog?.energy_level || 3} />
                        </motion.div>
                    </motion.div>
                </header>

                {/* Proactive Intervention */}
                <AnimatePresence>
                    {activeIntervention && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                        >
                            <InterventionCard
                                intervention={activeIntervention}
                                onDismiss={() => setActiveIntervention(null)}
                            />
                        </motion.div>
                    )}
                    {anticipationSignal && !activeIntervention && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mb-4"
                        >
                            <AnticipationBanner signal={anticipationSignal} />
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Intelligence Heartbeat */}
                <IntelligenceHeartbeat
                    context={intelContext}
                    isSyncing={isSyncingIntel}
                />

                {/* Main Command Center */}
                <FocusCompass
                    blocks={todayBlocks}
                    goals={goals}
                    energyLevel={todayLog?.energy_level}
                    todayProgress={{ completed: completedMinutes, planned: plannedMinutes }}
                    onCompleteBlock={handleCompleteBlock}
                />

                {/* Horizontal Timeline */}
                <div>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--text-tertiary)] mb-3 px-1">
                        Today's Flow
                    </h3>
                    <TimelineStrip blocks={todayBlocks} />
                </div>

                {/* Pillar Balance (Replaced Pulse) */}
                <PillarBalance
                    plannedMinutes={plannedByPillar}
                    completedMinutes={completedByPillar}
                />

                {/* Habit Stacks */}
                <div>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--text-tertiary)] mb-3 px-1">
                        Habit Stacks
                    </h3>
                    <HabitStacksList
                        todayBlocks={todayBlocks}
                        goals={goals}
                        onBlocksUpdated={refreshBlocks}
                    />
                </div>

                {/* Wisdom Feed (New) */}
                <WisdomFeed />
            </div>

            {/* Floating Reality Intake */}
            <RealityIntake
                currentEnergy={todayLog?.energy_level}
                onEnergySet={handleEnergySet}
                todayBlocks={todayBlocks}
                goals={goals}
                onBlocksUpdated={refreshBlocks}
            />

            {/* Week Planner Modal & Trigger */}
            <AnimatePresence>
                {showWeekPlanner && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="w-full max-w-4xl max-h-[90vh] overflow-y-auto"
                        >
                            <WeekPlanner
                                onClose={() => setShowWeekPlanner(false)}
                                onApply={() => {
                                    refreshBlocks();
                                    setShowWeekPlanner(false);
                                }}
                                context={{
                                    goals,
                                    anchors: [], // TODO: Load anchors if needed, orchestrator handles it mostly
                                    user_profile: profile
                                }}
                            />
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* AI Floating Action Button (Bottom Right) - Above Reality Intake */}
            <div className="fixed bottom-24 right-6 z-40">
                <PlanWeekFAB onClick={() => setShowWeekPlanner(true)} />
            </div>
        </>
    );
}
