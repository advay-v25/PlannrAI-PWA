'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOnboardingStore } from '@/stores';
import { GlassCard } from '@/components/ui/glass-card';
import { Bot, CheckCircle2, ShieldAlert, Zap, Cpu } from 'lucide-react';

export function Step5Options() {
    const { data, updateData } = useOnboardingStore();
    const [variants, setVariants] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchVariants = async () => {
            try {
                // In a real flow, this calls the AI generation endpoint.
                // For V1 UI scaffolding, we simulate the AI generation.
                setIsLoading(true);

                // Simulate network/generation time
                await new Promise(r => setTimeout(r, 2500));

                // Mock Variants based on the PRD
                setVariants([
                    {
                        id: 'balanced',
                        title: 'The Balanced Operator',
                        description: 'Consistent pacing. Prioritizes 8h sleep and strict meal boundaries.',
                        metrics: {
                            momentum_potential: 'High',
                            burnout_risk: 'Low',
                            goal_velocity: 'Steady'
                        },
                        icon: ShieldAlert
                    },
                    {
                        id: 'momentum',
                        title: 'Maximum Momentum',
                        description: 'Aggressive front-loading. Sacrifices some buffer time for deep work sprints.',
                        metrics: {
                            momentum_potential: 'Extreme',
                            burnout_risk: 'High',
                            goal_velocity: 'Accelerated'
                        },
                        icon: Zap
                    },
                    {
                        id: 'gentle',
                        title: 'Gentle Start',
                        description: 'Wide buffers, heavy recovery. Best if you are currently overwhelmed.',
                        metrics: {
                            momentum_potential: 'Moderate',
                            burnout_risk: 'Minimal',
                            goal_velocity: 'Gradual'
                        },
                        icon: Cpu
                    }
                ]);
            } catch (error) {
                console.error("Failed to generate variants", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchVariants();
    }, []);

    const handleSelect = (id: string) => {
        updateData({ selected_variant_id: id });
    };

    return (
        <div className="flex flex-col items-center justify-center space-y-8 w-full max-w-3xl mx-auto py-8">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center space-y-4"
            >
                <div className="flex items-center justify-center gap-2 text-[var(--color-primary)] mb-2">
                    <Bot size={24} />
                    <h2 className="text-3xl font-bold font-mono text-white">Trajectory Generation</h2>
                </div>
                <p className="text-[var(--color-text-secondary)]">
                    I have processed your absolute boundaries, goals, and biology. Select your execution OS.
                </p>
            </motion.div>

            <AnimatePresence mode="wait">
                {isLoading ? (
                    <motion.div
                        key="loading"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex flex-col items-center justify-center py-20 gap-6 w-full"
                    >
                        <div className="w-16 h-16 rounded-full border-t-2 border-r-2 border-[var(--color-primary)] animate-spin" />
                        <p className="font-mono text-[var(--color-primary)] animate-pulse uppercase tracking-widest text-sm">
                            Synthesizing 168 Hours...
                        </p>
                    </motion.div>
                ) : (
                    <motion.div
                        key="results"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full"
                    >
                        {variants.map((v, i) => {
                            const isSelected = data.selected_variant_id === v.id;
                            const Icon = v.icon;

                            return (
                                <button
                                    key={v.id}
                                    onClick={() => handleSelect(v.id)}
                                    className={`relative text-left flex flex-col p-6 rounded-2xl border transition-all \${
                                        isSelected 
                                            ? 'bg-[var(--color-primary)]/10 border-[var(--color-primary)] shadow-[0_0_20px_rgba(var(--color-primary-rgb),0.2)]'
                                            : 'bg-[var(--glass-surface)] border-[var(--glass-border)] hover:border-white/20'
                                    }`}
                                    style={{ transitionDelay: `\${i * 100}ms` }}
                                >
                                    {isSelected && (
                                        <div className="absolute top-4 right-4 text-[var(--color-primary)]">
                                            <CheckCircle2 size={20} />
                                        </div>
                                    )}
                                    
                                    <div className={`w-12 h-12 rounded-full mb-4 flex items-center justify-center \${isSelected ? 'bg-[var(--color-primary)] text-black' : 'bg-white/10 text-white'}`}>
                                        <Icon size={20} />
                                    </div>
                                    
                                    <h3 className="text-lg font-bold text-white mb-2">{v.title}</h3>
                                    <p className="text-sm text-[var(--color-text-secondary)] mb-6 flex-1">
                                        {v.description}
                                    </p>
                                    
                                    <div className="space-y-2 w-full pt-4 border-t border-[var(--glass-border)] text-xs font-mono">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[var(--color-text-tertiary)]">Velocity</span>
                                            <span className={v.metrics.goal_velocity === 'Accelerated' ? 'text-[var(--color-green)]' : 'text-white'}>
                                                {v.metrics.goal_velocity}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-[var(--color-text-tertiary)]">Burnout Risk</span>
                                            <span className={v.metrics.burnout_risk === 'High' ? 'text-[var(--color-red)]' : 'text-white'}>
                                                {v.metrics.burnout_risk}
                                            </span>
                                        </div>
                                    </div>
                                </button>
            );
                        })}
        </motion.div>
    )
}
            </AnimatePresence >
        </div >
    );
}
