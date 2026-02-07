
'use client';

import { motion } from 'framer-motion';
import { GlassCard } from '@/components/ui/glass-card';
import { Activity, Brain, Zap, Target } from 'lucide-react';

interface IntelligenceHeartbeatProps {
    context: {
        computedMode: 'focus' | 'recovery' | 'maintenance' | 'survival';
        energyCapacity: number;
        densityLimit: number;
        userContext: any[];
    } | null;
    isSyncing?: boolean;
}

export function IntelligenceHeartbeat({ context, isSyncing }: IntelligenceHeartbeatProps) {
    if (!context) return null;

    const modeColors = {
        focus: 'text-[var(--color-primary)]',
        recovery: 'text-[var(--color-accent-body)]',
        maintenance: 'text-[var(--color-accent-craft)]',
        survival: 'text-[var(--color-warning)]'
    };

    return (
        <GlassCard className="border-primary/10 bg-primary/5 overflow-hidden relative group">
            {/* Animated Gradient Sweep */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none overflow-hidden">
                <motion.div
                    animate={{ x: ['100%', '-100%'] }}
                    transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-primary to-transparent"
                />
            </div>

            <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                        <Activity className={`w-6 h-6 text-primary ${isSyncing ? 'animate-pulse' : ''}`} />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-[0.2em] flex items-center gap-2">
                            System Intelligence
                            {isSyncing && <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />}
                        </p>
                        <h4 className="text-xl font-bold flex items-center gap-2 mt-0.5">
                            Focus State: <span className={`${modeColors[context.computedMode]} drop-shadow-[0_0_8px_rgba(var(--color-primary-rgb),0.3)]`}>{context.computedMode.toUpperCase()}</span>
                        </h4>
                    </div>
                </div>

                <div className="flex items-center gap-8 px-2">
                    <div className="flex flex-col items-center">
                        <div className="flex items-center gap-1.5 mb-1">
                            <Zap className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                            <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold tracking-widest">Resonance</span>
                        </div>
                        <p className="text-xl font-mono font-bold">{context.energyCapacity}%</p>
                    </div>
                    <div className="h-10 w-px bg-white/10 hidden md:block" />
                    <div className="flex flex-col items-center">
                        <div className="flex items-center gap-1.5 mb-1">
                            <Target className="w-3.5 h-3.5 text-[var(--color-accent-mind)]" />
                            <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold tracking-widest">Density</span>
                        </div>
                        <p className="text-xl font-mono font-bold">{(context.densityLimit * 100).toFixed(0)}%</p>
                    </div>
                </div>
            </div>

            {/* Proactive Reasoning / Context Snippet */}
            {context.userContext && context.userContext.length > 0 && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-6 pt-5 border-t border-white/5 flex items-start gap-4"
                >
                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                        <Brain className="w-4 h-4 text-primary opacity-70" />
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center justify-between mb-1.5">
                            <p className="text-[9px] font-bold text-primary/60 uppercase tracking-widest">Internal Logic Sync</p>
                            <p className="text-[8px] text-[var(--text-tertiary)] font-mono uppercase">Source: Behavior Pattern Engine</p>
                        </div>
                        <p className="text-sm text-[var(--text-secondary)] italic leading-relaxed font-light">
                            "{context.userContext[0].content}"
                        </p>
                        <p className="text-[9px] text-white/20 mt-2 font-mono">CONFIDENCE_LEVEL: 0.{Math.floor(context.userContext[0].confidence * 100)}</p>
                    </div>
                </motion.div>
            )}
        </GlassCard>
    );
}
