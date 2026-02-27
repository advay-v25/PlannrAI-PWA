'use client';

import { motion } from 'framer-motion';
import { Sparkles, ArrowRight, Play, CheckCircle2, ShieldAlert, Zap, Coffee, Check, X } from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import type { HomeState } from '@/app/api/home/state/route';

interface StateHeroProps {
    state: HomeState;
    currentTime: string;
    activeBlock?: any;
    nextBlock?: any;
    metrics: {
        timeRemainingInBlock: number | null;
        timeUntilNextBlock: number | null;
    };
    insight?: string;
    onAction: (actionType: string) => void;
}

export function StateHero({ state, currentTime, activeBlock, nextBlock, metrics, insight, onAction }: StateHeroProps) {

    // Renders the specific UI based on the 7 states
    const renderSpecificState = () => {
        switch (state) {
            case 'NO_SCHEDULE':
                return (
                    <div className="flex flex-col items-center justify-center text-center space-y-4 py-8">
                        <div className="w-16 h-16 rounded-full bg-[var(--glass-surface)] border border-[var(--glass-border)] flex items-center justify-center mb-2">
                            <Sparkles className="w-8 h-8 text-[var(--color-primary)]" />
                        </div>
                        <h2 className="text-2xl font-bold font-mono">Blank Slate</h2>
                        <p className="text-[var(--color-text-secondary)] text-sm max-w-sm">
                            You have no blocks scheduled for today. Ready to map out the next 168 hours?
                        </p>
                        <GlassButton
                            variant="primary"
                            className="mt-4 px-8"
                            onClick={() => onAction('generate_schedule')}
                        >
                            Generate Schedule
                        </GlassButton>
                    </div>
                );

            case 'MORNING_ROUTINE':
                return (
                    <div className="flex flex-col items-start space-y-4">
                        <div className="w-12 h-12 rounded-full bg-[var(--color-green)]/20 text-[var(--color-green)] flex items-center justify-center mb-2">
                            <Coffee className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-3xl font-bold font-mono text-white mb-1">System Initialize</h2>
                            <p className="text-[var(--color-text-secondary)]">
                                {nextBlock ? `First block starts in ${metrics.timeUntilNextBlock}m. Drink water. Ground yourself.` : 'Ready to begin.'}
                            </p>
                        </div>
                        {nextBlock && (
                            <div className="pt-4 w-full">
                                <span className="text-xs font-mono text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2 block">Next Up</span>
                                <GlassCard className="p-4 border-l-4 border-l-[var(--color-primary)]">
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <div className="text-white font-medium">{nextBlock.title}</div>
                                            <div className="text-sm text-[var(--color-text-secondary)]">{nextBlock.start_time}</div>
                                        </div>
                                    </div>
                                </GlassCard>
                            </div>
                        )}
                    </div>
                );

            case 'IN_BLOCK':
                return (
                    <div className="flex flex-col relative w-full">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--color-primary)]/10 blur-[50px] rounded-full pointer-events-none" />

                        <div className="flex justify-between items-end mb-6">
                            <div>
                                <h3 className="text-sm font-mono text-[var(--color-primary)] uppercase tracking-wider mb-1 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-[var(--color-primary)] animate-pulse" />
                                    Active Matrix
                                </h3>
                                <h1 className="text-4xl font-bold text-white tracking-tight">{activeBlock?.title || 'Focused Block'}</h1>
                            </div>
                            <div className="text-right">
                                <div className="text-3xl font-mono text-white">{metrics.timeRemainingInBlock}</div>
                                <div className="text-xs font-mono text-[var(--color-text-tertiary)] uppercase">Mins Left</div>
                            </div>
                        </div>

                        {/* Progress Bar Mock */}
                        <div className="w-full h-1 bg-black/40 rounded-full overflow-hidden mb-8">
                            <motion.div
                                className="h-full bg-[var(--color-primary)]"
                                initial={{ width: "0%" }}
                                animate={{ width: "65%" }} // mocked for now
                                transition={{ duration: 1 }}
                            />
                        </div>

                        <div className="flex gap-3">
                            <GlassButton variant="primary" className="flex-1" onClick={() => onAction('complete_block')}>
                                <Check size={18} className="mr-2" /> Mark Complete
                            </GlassButton>
                            <GlassButton variant="danger" className="px-4" onClick={() => onAction('fail_block')}>
                                <X size={18} />
                            </GlassButton>
                        </div>
                    </div>
                );

            case 'BETWEEN_BLOCKS':
                return (
                    <div className="flex flex-col items-center justify-center text-center space-y-4 py-6">
                        <div className="text-[#888] font-mono mb-2">
                            <span>00:</span>
                            <span className="text-white text-4xl">{String(metrics.timeUntilNextBlock || 0).padStart(2, '0')}</span>
                            <span>:00</span>
                        </div>
                        <h2 className="text-xl font-bold text-white mb-2">Buffer Zone</h2>
                        <p className="text-[var(--color-text-secondary)] text-sm max-w-sm mb-6">
                            Stand up. Breathe. Let the previous context dissolve before entering {nextBlock?.title || 'the next block'}.
                        </p>
                        <GlassButton
                            variant="ghost"
                            className="bg-white/5 border border-white/10 hover:bg-white/10"
                            onClick={() => onAction('start_early')}
                        >
                            <Play size={16} className="mr-2 text-[var(--color-green)]" /> Start Next Block Early
                        </GlassButton>
                    </div>
                );

            case 'BEHIND_SCHEDULE':
                return (
                    <div className="flex flex-col items-start space-y-4 p-4 border border-[var(--color-red)]/30 bg-[var(--color-red)]/5 rounded-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--color-red)]/10 blur-[50px] rounded-full pointer-events-none" />
                        <div className="flex items-center gap-3 text-[var(--color-red)] mb-1">
                            <ShieldAlert size={24} />
                            <h2 className="text-2xl font-bold font-mono">Reality Drift Detected</h2>
                        </div>
                        <p className="text-white/80">
                            You missed the last block. Fact, not failure. How do we proceed?
                        </p>
                        <div className="grid grid-cols-1 w-full gap-3 mt-4">
                            <GlassButton variant="ghost" className="justify-start border-[var(--glass-border)] hover:border-[var(--color-primary)]" onClick={() => onAction('shift_schedule')}>
                                Shift everything back 30 mins
                            </GlassButton>
                            <GlassButton variant="ghost" className="justify-start border-[var(--glass-border)] hover:border-[var(--color-red)]" onClick={() => onAction('drop_block')}>
                                Drop the missed block, continue schedule
                            </GlassButton>
                        </div>
                    </div>
                );

            case 'AHEAD_OF_SCHEDULE':
                return (
                    <div className="flex flex-col items-start space-y-4 p-4 border border-[var(--color-green)]/30 bg-[var(--color-green)]/5 rounded-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--color-green)]/10 blur-[50px] rounded-full pointer-events-none" />
                        <div className="flex items-center gap-3 text-[var(--color-green)] mb-1">
                            <Zap size={24} />
                            <h2 className="text-2xl font-bold font-mono">Time Recaptured</h2>
                        </div>
                        <p className="text-white/80">
                            You beat the estimate. Take a real break or pull forward the next block.
                        </p>
                        <div className="grid grid-cols-1 w-full gap-3 mt-4">
                            <GlassButton variant="primary" className="justify-start" onClick={() => onAction('start_early')}>
                                Start Next Block Now
                            </GlassButton>
                            <GlassButton variant="ghost" className="justify-start border-[var(--glass-border)] hover:border-white/20" onClick={() => onAction('rest')}>
                                Bank the time. I am resting.
                            </GlassButton>
                        </div>
                    </div>
                );

            case 'DAY_COMPLETE':
                return (
                    <div className="flex flex-col items-center justify-center text-center space-y-4 py-8">
                        <div className="w-16 h-16 rounded-full bg-[var(--color-green)]/20 border border-[var(--color-green)]/50 flex items-center justify-center mb-2 shadow-[0_0_30px_rgba(0,255,0,0.2)]">
                            <CheckCircle2 className="w-8 h-8 text-[var(--color-green)]" />
                        </div>
                        <h2 className="text-3xl font-bold font-mono text-white">Shutdown Complete</h2>
                        <p className="text-[var(--color-text-secondary)] text-sm max-w-sm mb-6">
                            Close the loops. Tomorrow is a new system instance.
                        </p>
                        <GlassButton
                            variant="ghost"
                            onClick={() => onAction('end_of_day_review')}
                        >
                            Log Final Thoughts
                        </GlassButton>
                    </div>
                );

            default:
                return null;
        }
    };

    return (
        <div className="flex flex-col gap-4 w-full">
            {/* Main State Card */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="w-full"
            >
                {renderSpecificState()}
            </motion.div>

            {/* Proactive Insight Ribbon (If Donna has something to say) */}
            {insight && state !== 'NO_SCHEDULE' && (
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    transition={{ delay: 0.3 }}
                    className="w-full"
                >
                    <GlassCard className="p-4 border-l-2 border-[var(--color-primary)] bg-[var(--color-primary)]/5 flex gap-4 items-start">
                        <div className="mt-1">
                            <Zap size={16} className="text-[var(--color-primary)]" />
                        </div>
                        <div>
                            <span className="text-xs font-mono text-[var(--color-primary)] uppercase tracking-wider block mb-1">Incoming Transmission</span>
                            <p className="text-sm text-white/90 leading-relaxed font-mono">
                                {insight}
                            </p>
                        </div>
                    </GlassCard>
                </motion.div>
            )}
        </div>
    );
}
