'use client';

import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { Sparkles, ArrowRight, Play, CheckCircle2, ShieldAlert, Zap, Coffee, Check, X } from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { formatTimeString } from '@/lib/utils';
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
    const [progressPct, setProgressPct] = useState(0);

    useEffect(() => {
        if (state === 'IN_BLOCK' && activeBlock?.start_time && activeBlock?.end_time) {
            const calculateProgress = () => {
                const now = new Date();
                const todayStr = now.toISOString().split('T')[0];
                const start = new Date(`${todayStr}T${activeBlock.start_time}`);
                const end = new Date(`${todayStr}T${activeBlock.end_time}`);
                const total = end.getTime() - start.getTime();
                const elapsed = now.getTime() - start.getTime();
                setProgressPct(Math.max(0, Math.min(100, (elapsed / total) * 100)));
            };

            calculateProgress();
            const interval = setInterval(calculateProgress, 60000);
            return () => clearInterval(interval);
        }
    }, [state, activeBlock]);

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
                                            <div className="text-sm text-[var(--color-text-secondary)]">{formatTimeString(nextBlock.start_time)}</div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => onAction('start_early')} className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-md text-xs font-bold text-white transition-colors">Start</button>
                                            <button onClick={() => onAction('skip_next')} className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-md text-xs font-bold text-white/50 transition-colors">Skip</button>
                                            <button onClick={() => onAction('reschedule_next')} className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-md text-xs font-bold text-white/50 transition-colors">Reschedule</button>
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
                                    <span className="w-2 h-2 rounded-full bg-[var(--color-primary)] animate-scifi-blink" />
                                    Active Matrix
                                </h3>
                                <h1 className="text-4xl font-bold text-white tracking-tight">{activeBlock?.title || 'Focused Block'}</h1>
                            </div>
                            <div className="text-right">
                                <div className="text-3xl font-mono text-white">{metrics.timeRemainingInBlock}</div>
                                <div className="text-xs font-mono text-[var(--color-text-tertiary)] uppercase">Mins Left</div>
                            </div>
                        </div>

                        <div className="w-full h-1 bg-black/40 rounded-full overflow-hidden mb-8">
                            <motion.div
                                className="h-full bg-[var(--color-primary)]"
                                initial={{ width: "0%" }}
                                animate={{ width: `${progressPct}%` }}
                                transition={{ duration: 1 }}
                            />
                        </div>

                        <div className="flex gap-3 mt-8">
                            <GlassButton variant="primary" className="flex-1 text-sm bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/80 text-black border-transparent" onClick={() => onAction('complete_early')}>
                                <Check size={18} className="mr-2" /> Done
                            </GlassButton>
                            <GlassButton variant="ghost" className="flex-1 text-sm border-white/10 hover:bg-white/5 hover:text-[var(--color-red)] text-white/70" onClick={() => onAction('mark_incomplete')}>
                                <X size={18} className="mr-2" /> Incomplete
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
                        <div className="flex gap-3 justify-center w-full max-w-sm">
                            <GlassButton
                                variant="ghost"
                                className="bg-white/5 border border-white/10 hover:bg-white/10 flex-1"
                                onClick={() => onAction('start_early')}
                            >
                                <Play size={16} className="mr-2 text-[var(--color-green)]" /> Start
                            </GlassButton>
                            <GlassButton
                                variant="ghost"
                                className="bg-white/5 border border-white/10 hover:bg-white/10 flex-1"
                                onClick={() => onAction('skip_next')}
                            >
                                Skip
                            </GlassButton>
                            <GlassButton
                                variant="ghost"
                                className="bg-white/5 border border-white/10 hover:bg-white/10 flex-1"
                                onClick={() => onAction('reschedule_next')}
                            >
                                Reschedule
                            </GlassButton>
                        </div>
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
                if (activeBlock) {
                    return (
                        <div className="flex flex-col relative w-full">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--color-primary)]/10 blur-[50px] rounded-full pointer-events-none" />

                            <div className="flex justify-between items-end mb-6">
                                <div>
                                    <h3 className="text-sm font-mono text-[var(--color-primary)] uppercase tracking-wider mb-1 flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-[var(--color-primary)]" />
                                        End of Day
                                    </h3>
                                    <h1 className="text-4xl font-bold text-white tracking-tight">{activeBlock.title || 'Last Block'}</h1>
                                </div>
                                <div className="text-right">
                                    <div className="text-3xl font-mono text-white">0</div>
                                    <div className="text-xs font-mono text-[var(--color-text-tertiary)] uppercase">Mins Left</div>
                                </div>
                            </div>

                            <div className="flex gap-3 mt-8">
                                <GlassButton variant="primary" className="flex-1 text-sm bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/80 text-black border-transparent" onClick={() => onAction('complete_early')}>
                                    <Check size={18} className="mr-2" /> Done
                                </GlassButton>
                                <GlassButton variant="ghost" className="flex-1 text-sm border-white/10 hover:bg-white/5 hover:text-[var(--color-red)] text-white/70" onClick={() => onAction('mark_incomplete')}>
                                    <X size={18} className="mr-2" /> Incomplete
                                </GlassButton>
                            </div>
                        </div>
                    );
                }
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
                            <span className="text-xs font-mono text-[var(--color-primary)] uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-scifi-blink" />
                                Incoming Transmission
                            </span>
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
