'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { useUserStore, useGoalsStore, useDailyLogStore } from '@/stores';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { GlassToggle } from '@/components/ui/glass-toggle';
import { EnergyCheck, TodayBlocksSummary } from '@/components/reality-intake';
import { HabitStacksList } from '@/components/habit-stacks';
import { NextMoveCard, NextMovePrompt } from '@/components/next-move';
import { AIInsightCard } from '@/components/ai-insight-card';
import { formatDate, getGreeting, calculateProgress } from '@/lib/utils';
import {
    Brain,
    Battery,
    ChevronRight,
    Sparkles,
    Clock,
    Check,
    AlertCircle,
    Zap,
    Calendar,
} from 'lucide-react';
import Link from 'next/link';
import type { Goal, ScheduleBlock, InterventionLog } from '@/types/database';
import { InterventionCard } from '@/components/dashboard/intervention-card';
import { checkInterventionsAction } from '@/app/actions/interventions';
import { MorningBriefing } from '@/components/dashboard/morning-briefing';

export default function HomePage() {
    const supabase = createClient();
    const { profile, setProfile, updateProfile } = useUserStore();
    const { goals, setGoals } = useGoalsStore();
    const { todayLog, setTodayLog } = useDailyLogStore();
    const [isLoading, setIsLoading] = useState(true);
    const [todayBlocks, setTodayBlocks] = useState<ScheduleBlock[]>([]);
    const [showEnergyCheck, setShowEnergyCheck] = useState(true);
    const [showNextMove, setShowNextMove] = useState(false);
    const [activeSection, setActiveSection] = useState<'blocks' | 'habits'>('blocks');
    const [showAIInsight, setShowAIInsight] = useState(true);
    const [activeIntervention, setActiveIntervention] = useState<InterventionLog | null>(null);

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
                .single();

            if (logData) {
                setTodayLog({
                    energy_level: logData.energy_level,
                    mood: logData.mood || '',
                    wins: logData.wins || [],
                    challenges: logData.challenges || [],
                });
                setShowEnergyCheck(false);
            }

            // Check for proactive interventions (The "Donna" Loop)
            try {
                const nudge = await checkInterventionsAction(user.id);
                if (nudge) setActiveIntervention(nudge);
            } catch (err) {
                console.error('Intervention check failed', err);
            }

            setIsLoading(false);
        }

        loadData();
    }, [supabase, setProfile, setGoals, setTodayLog]);

    const handleLowEnergyToggle = async (checked: boolean) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        updateProfile({ low_energy_mode: checked });

        await supabase
            .from('profiles')
            .update({ low_energy_mode: checked })
            .eq('id', user.id);
    };

    const handleEnergySet = async (level: number) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const today = new Date().toISOString().split('T')[0];

        // Upsert daily log
        await supabase
            .from('daily_logs')
            .upsert({
                user_id: user.id,
                log_date: today,
                energy_level: level,
            }, {
                onConflict: 'user_id,log_date',
            });

        // Auto-enable low energy mode if energy is very low
        if (level <= 2 && !profile?.low_energy_mode) {
            handleLowEnergyToggle(true);
        }

        // Dismiss energy check after a brief delay
        setTimeout(() => setShowEnergyCheck(false), 1500);
    };

    // Calculate progress
    const plannedMinutes = goals.reduce((sum, g) => sum + g.minutes_per_day, 0);
    const completedBlocks = todayBlocks.filter(b => b.status === 'done');
    const missedBlocks = todayBlocks.filter(b => b.status === 'missed');
    const completedMinutes = completedBlocks.reduce((sum, b) => {
        const start = new Date(`1970-01-01T${b.start_time}`);
        const end = new Date(`1970-01-01T${b.end_time}`);
        return sum + (end.getTime() - start.getTime()) / 60000;
    }, 0);

    const progress = calculateProgress(plannedMinutes, completedMinutes);

    // Get primary focus (highest importance goal not done today)
    const primaryGoal = goals.find(g => g.importance === 'high') || goals[0];

    // Get blocks that need attention (planned but not logged)
    const pendingBlocks = todayBlocks.filter(b => b.status === 'planned');
    const currentHour = new Date().getHours();
    const pastPendingBlocks = pendingBlocks.filter(b => {
        const blockHour = parseInt(b.end_time.split(':')[0]);
        return blockHour <= currentHour;
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-10 pb-12">
            {/* Enchanting Nexus Header */}
            <header className="relative py-8">
                <div className="absolute -top-20 -left-20 w-64 h-64 bg-[var(--color-primary)]/10 rounded-full blur-[100px] animate-pulse" />
                <div className="absolute top-0 right-0 w-48 h-48 bg-[var(--color-mind)]/5 rounded-full blur-[80px]" />

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="relative z-10 space-y-2"
                >
                    <p className="text-overline tracking-[0.2em] opacity-60">
                        {formatDate(new Date()).toUpperCase()}
                    </p>
                    <h1 className="text-display tracking-tight bg-clip-text text-transparent bg-gradient-to-br from-white via-white to-white/40">
                        {getGreeting()}, <br />
                        <span className="text-gradient font-bold">{profile?.preferred_name || profile?.full_name?.split(' ')[0] || 'Friend'}</span>
                    </h1>
                </motion.div>

                {todayLog && (
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="absolute top-10 right-0"
                    >
                        <GlassCard variant="deep" padding="sm" className="flex items-center gap-3 px-4 backdrop-blur-3xl border-white/5">
                            <div className="relative">
                                <Zap className={`w-5 h-5 ${todayLog.energy_level >= 4 ? 'text-[var(--color-success)]' :
                                    todayLog.energy_level >= 3 ? 'text-[var(--color-primary)]' :
                                        'text-[var(--color-warning)]'
                                    } animate-pulse`} />
                                <div className="absolute inset-0 blur-md bg-current opacity-30" />
                            </div>
                            <div>
                                <p className="text-[10px] text-overline opacity-50">Energy Status</p>
                                <p className="text-sm font-bold">{todayLog.energy_level}/5</p>
                            </div>
                        </GlassCard>
                    </motion.div>
                )}
            </header>

            {/* Morning Briefing & Proactive Intelligence */}
            <div className="relative">
                <AnimatePresence mode="wait">
                    {activeIntervention ? (
                        <motion.div
                            key="intervention"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                        >
                            <InterventionCard
                                intervention={activeIntervention}
                                onDismiss={() => setActiveIntervention(null)}
                            />
                        </motion.div>
                    ) : (
                        <motion.div
                            key="briefing"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                        >
                            <MorningBriefing />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Energy Check (if not logged today) */}
            <AnimatePresence>
                {showEnergyCheck && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                    >
                        <EnergyCheck onEnergySet={handleEnergySet} />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* AI Daily Insight Card */}
            <AnimatePresence>
                {showAIInsight && !showEnergyCheck && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                    >
                        <AIInsightCard onDismiss={() => setShowAIInsight(false)} />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Low Energy Toggle */}
            <GlassCard padding="md">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--color-warning)]/20 flex items-center justify-center">
                        <Battery className="w-5 h-5 text-[var(--color-warning)]" />
                    </div>
                    <div className="flex-1">
                        <GlassToggle
                            checked={profile?.low_energy_mode || false}
                            onChange={handleLowEnergyToggle}
                            label="Low energy mode"
                            description="Reduce expectations, focus on essentials"
                        />
                    </div>
                </div>
            </GlassCard>

            {/* Alert: Missed blocks */}
            {pastPendingBlocks.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                >
                    <Link href="/app/calendar">
                        <GlassCard interactive padding="md" className="border-l-4 border-[var(--color-warning)] group">
                            <div className="flex items-center gap-3">
                                <AlertCircle className="w-5 h-5 text-[var(--color-warning)]" />
                                <div className="flex-1">
                                    <p className="font-medium text-sm">
                                        {pastPendingBlocks.length} block{pastPendingBlocks.length > 1 ? 's' : ''} need logging
                                    </p>
                                    <p className="text-xs text-[var(--text-tertiary)]">
                                        Tap to log what happened
                                    </p>
                                </div>
                                <ChevronRight className="w-5 h-5 text-[var(--text-tertiary)] group-hover:translate-x-1 transition-transform" />
                            </div>
                        </GlassCard>
                    </Link>
                </motion.div>
            )}

            {/* Primary Focus */}
            {primaryGoal && (
                <GlassCard variant="glow" padding="lg" className="relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-[var(--color-primary)] opacity-10 blur-3xl" />

                    <div className="relative z-10">
                        <p className="text-overline mb-2">Today&apos;s Focus</p>
                        <h2 className="text-heading mb-1">{primaryGoal.title}</h2>
                        <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                            <Clock className="w-4 h-4" />
                            <span>
                                {profile?.low_energy_mode
                                    ? Math.round(primaryGoal.minutes_per_day * 0.5)
                                    : primaryGoal.minutes_per_day} min
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-xs category-${primaryGoal.category}`}>
                                {primaryGoal.category}
                            </span>
                        </div>
                    </div>
                </GlassCard>
            )}

            {/* Progress Overview */}
            <GlassCard padding="md">
                <div className="flex items-center gap-4">
                    {/* Progress Ring */}
                    <div className="relative w-16 h-16">
                        <svg className="w-full h-full transform -rotate-90">
                            <circle
                                cx="32"
                                cy="32"
                                r="28"
                                fill="none"
                                stroke="var(--glass-border)"
                                strokeWidth="4"
                            />
                            <motion.circle
                                cx="32"
                                cy="32"
                                r="28"
                                fill="none"
                                stroke="var(--color-primary)"
                                strokeWidth="4"
                                strokeLinecap="round"
                                initial={{ strokeDasharray: '0 176' }}
                                animate={{
                                    strokeDasharray: `${(progress / 100) * 176} 176`
                                }}
                                transition={{ duration: 1, ease: 'easeOut' }}
                            />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-sm font-bold">{progress}%</span>
                        </div>
                    </div>
                    <div className="flex-1">
                        <p className="font-medium">Today&apos;s Progress</p>
                        <p className="text-xs text-[var(--text-tertiary)]">
                            {completedBlocks.length} blocks • {Math.round(completedMinutes)} min
                        </p>
                    </div>
                    {/* Quick Stats */}
                    <div className="flex gap-2">
                        {completedBlocks.length > 0 && (
                            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-[var(--color-success-soft)]">
                                <Check className="w-3 h-3 text-[var(--color-success)]" />
                                <span className="text-xs font-medium text-[var(--color-success)]">
                                    {completedBlocks.length}
                                </span>
                            </div>
                        )}
                        {missedBlocks.length > 0 && (
                            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-[var(--color-error-soft)]">
                                <AlertCircle className="w-3 h-3 text-[var(--color-error)]" />
                                <span className="text-xs font-medium text-[var(--color-error)]">
                                    {missedBlocks.length}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </GlassCard>

            {/* Section Tabs: Blocks / Habits */}
            <div className="flex gap-2">
                <button
                    onClick={() => setActiveSection('blocks')}
                    className={`flex-1 py-2 px-4 rounded-xl text-sm font-medium transition-all ${activeSection === 'blocks'
                        ? 'bg-[var(--color-primary)] text-white'
                        : 'bg-[var(--glass-bg)] text-[var(--text-secondary)]'
                        }`}
                >
                    Today&apos;s Blocks ({todayBlocks.length})
                </button>
                <button
                    onClick={() => setActiveSection('habits')}
                    className={`flex-1 py-2 px-4 rounded-xl text-sm font-medium transition-all ${activeSection === 'habits'
                        ? 'bg-[var(--color-primary)] text-white'
                        : 'bg-[var(--glass-bg)] text-[var(--text-secondary)]'
                        }`}
                >
                    Habit Stacks
                </button>
            </div>

            {/* Active Section Content */}
            <AnimatePresence mode="wait">
                {activeSection === 'blocks' ? (
                    <motion.div
                        key="blocks"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                    >
                        {todayBlocks.length > 0 ? (
                            <TodayBlocksSummary blocks={todayBlocks.map(b => ({
                                id: b.id,
                                title: b.context || 'Scheduled Block',
                                goal: b.goal ? { title: b.goal.title, category: b.goal.category } : undefined,
                                start_time: b.start_time,
                                end_time: b.end_time,
                                status: b.status,
                            }))} />
                        ) : (
                            <GlassCard padding="lg" className="text-center">
                                <Clock className="w-10 h-10 mx-auto mb-3 text-[var(--text-tertiary)]" />
                                <p className="font-medium mb-1">No blocks scheduled</p>
                                <p className="text-caption mb-4">
                                    Add time blocks to track your day
                                </p>
                                <Link href="/app/calendar">
                                    <GlassButton variant="primary" size="sm">
                                        <Sparkles className="w-4 h-4" />
                                        Plan Your Day
                                    </GlassButton>
                                </Link>
                            </GlassCard>
                        )}
                    </motion.div>
                ) : (
                    <motion.div
                        key="habits"
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                    >
                        <HabitStacksList />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Next Move Guidance */}
            <AnimatePresence mode="wait">
                {showNextMove ? (
                    <NextMoveCard
                        onSelect={() => setShowNextMove(false)}
                        onDismiss={() => setShowNextMove(false)}
                    />
                ) : (
                    <NextMovePrompt
                        onExpand={() => setShowNextMove(true)}
                        show={!showEnergyCheck}
                    />
                )}
            </AnimatePresence>

            {/* Brain Dump Shortcut */}
            <Link href="/app/brain-dump">
                <GlassCard interactive padding="md" className="group">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[var(--color-mind)]/20 flex items-center justify-center">
                            <Brain className="w-5 h-5 text-[var(--color-mind)]" />
                        </div>
                        <div className="flex-1">
                            <p className="font-medium">Mind feeling cluttered?</p>
                            <p className="text-xs text-[var(--text-tertiary)]">Quick brain dump →</p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-[var(--text-tertiary)] group-hover:translate-x-1 transition-transform" />
                    </div>
                </GlassCard>
            </Link>

            {/* Plan Week Shortcut */}
            <Link href="/app/calendar">
                <GlassCard interactive padding="md" variant="glow" className="group">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[var(--color-future)]/20 flex items-center justify-center">
                            <Calendar className="w-5 h-5 text-[var(--color-future)]" />
                        </div>
                        <div className="flex-1">
                            <p className="font-medium">Plan your week</p>
                            <p className="text-xs text-[var(--text-tertiary)]">Let AI optimize your schedule →</p>
                        </div>
                        <Sparkles className="w-5 h-5 text-[var(--color-primary)] group-hover:scale-110 transition-transform" />
                    </div>
                </GlassCard>
            </Link>
        </div>
    );
}
