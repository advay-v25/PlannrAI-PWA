'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Hooks
import { useHomeManager } from '@/hooks/use-home-manager';

// V3 Components
import { AmbientPulse } from '@/components/dashboard/ambient-pulse';
import { FocusCompass } from '@/components/dashboard/focus-compass';
import { TimelineStrip } from '@/components/dashboard/timeline-strip';
import { PillarBalance } from '@/components/dashboard/pillar-balance';
import { RealityIntake } from '@/components/dashboard/reality-intake';
import { EnergyGauge } from '@/components/ui/energy-gauge';
import { WisdomFeed } from '@/components/dashboard/wisdom-feed';
import { InterventionCard } from '@/components/dashboard/intervention-card';
import { AnticipationBanner } from '@/components/dashboard/anticipation-banner';
import { IntelligenceHeartbeat } from '@/components/dashboard/intelligence-heartbeat';
import { WeekPlanner, PlanWeekFAB } from '@/components/week-planner';
import { HabitStacksList } from '@/components/habit-stacks';
import { HabitStackWizard } from '@/components/habit-stacks/habit-stack-wizard';

import { formatDate, getGreeting } from '@/lib/utils';

export default function HomePage() {
    const {
        profile,
        goals,
        todayLog,
        todayBlocks,
        isLoading,
        activeIntervention,
        setActiveIntervention,
        anticipationSignal,
        intelContext,
        isSyncingIntel,
        pillarStats,
        progress,
        refreshBlocks,
        handleEnergySet,
        handleCompleteBlock
    } = useHomeManager();

    const [showWeekPlanner, setShowWeekPlanner] = useState(false);
    const [showHabitWizard, setShowHabitWizard] = useState(false);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[80vh]">
                <div className="w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <>
            {/* Dynamic Background */}
            <AmbientPulse
                energyLevel={todayLog?.energy_level || 3}
                isActive={todayBlocks.some(b => b.status === 'active')}
            />

            <div className="relative z-10 space-y-8 pb-32">

                {/* 1. Header & Energy */}
                <header className="pt-6 pb-2 flex items-center justify-between">
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                        <p className="text-[10px] tracking-[0.3em] uppercase text-[var(--text-tertiary)]">
                            {formatDate(new Date())}
                        </p>
                        <h1 className="text-2xl font-bold mt-1">
                            {getGreeting()}, <span className="text-gradient">{profile?.preferred_name || 'Friend'}</span>
                        </h1>
                    </motion.div>
                    <EnergyGauge level={todayLog?.energy_level || 3} />
                </header>

                {/* 2. Intelligence Layer & Interventions */}
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
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                            <AnticipationBanner signal={anticipationSignal} />
                        </motion.div>
                    )}
                </AnimatePresence>

                <IntelligenceHeartbeat
                    context={intelContext}
                    isSyncing={isSyncingIntel}
                />

                {/* 3. Main Dashboard Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Compass (Center/Top) */}
                    <div className="lg:col-span-2 space-y-6">
                        <FocusCompass
                            blocks={todayBlocks}
                            goals={goals}
                            energyLevel={todayLog?.energy_level}
                            todayProgress={progress}
                            onCompleteBlock={handleCompleteBlock}
                        />
                        <div className="space-y-3">
                            <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--text-tertiary)] px-1">
                                Today's Flow
                            </h3>
                            <TimelineStrip blocks={todayBlocks} />
                        </div>
                    </div>

                    {/* Right Column (Stats & Habits) */}
                    <div className="space-y-6">
                        <PillarBalance
                            plannedMinutes={pillarStats.planned}
                            completedMinutes={pillarStats.completed}
                        />
                        <div className="space-y-3">
                            <div className="flex justify-between items-center px-1">
                                <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--text-tertiary)]">
                                    Habit Stacks
                                </h3>
                                {/* Custom trigger for Wizard */}
                                <button
                                    onClick={() => setShowHabitWizard(true)}
                                    className="text-[10px] font-bold text-[var(--color-primary)] hover:underline"
                                >
                                    + NEW STACK
                                </button>
                            </div>

                            {/* We pass specific props to hide internal creation buttons if we want, or let it live */}
                            <HabitStacksList
                                todayBlocks={todayBlocks}
                                goals={goals}
                                onBlocksUpdated={refreshBlocks}
                            // We can possibly override the internal "AI Assist" button to open our Wizard
                            // But `HabitStacksList` controls its own state. 
                            // Ideally we refactor `HabitStacksList` to accept `onOpenWizard` prop or similar.
                            // For now, we'll let the user use the floating button text or the internal one if we update it.
                            />
                        </div>
                    </div>
                </div>

                {/* 4. Wisdom Feed */}
                <WisdomFeed />
            </div>

            {/* 5. Floating Logic */}
            <RealityIntake
                currentEnergy={todayLog?.energy_level}
                onEnergySet={handleEnergySet}
                todayBlocks={todayBlocks}
                goals={goals}
                onBlocksUpdated={refreshBlocks}
            />

            <div className="fixed bottom-24 right-6 z-40">
                <PlanWeekFAB onClick={() => setShowWeekPlanner(true)} />
            </div>

            {/* Modals */}
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
                                    anchors: [],
                                    user_profile: profile
                                }}
                            />
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {showHabitWizard && (
                <HabitStackWizard
                    isOpen={true}
                    onClose={() => setShowHabitWizard(false)}
                    onSuccess={refreshBlocks}
                />
            )}
        </>
    );
}
