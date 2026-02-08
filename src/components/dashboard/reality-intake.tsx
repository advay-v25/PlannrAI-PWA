'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '@/components/ui/glass-card';
import { Zap, Brain, ChevronUp, X, Activity } from 'lucide-react';
import Link from 'next/link';

interface RealityIntakeProps {
    currentEnergy?: number;
    onEnergySet: (level: number) => void;
}

export function RealityIntake({ currentEnergy, onEnergySet }: RealityIntakeProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [selectedEnergy, setSelectedEnergy] = useState(currentEnergy || 3);

    const energyLabels = ['Depleted', 'Low', 'Moderate', 'Good', 'Peak'];
    const energyColors = [
        'var(--color-warning)', // using warning for low
        'var(--color-warning)',
        'var(--color-primary)',
        'var(--color-primary)',
        'var(--color-success)'
    ];

    const handleConfirm = () => {
        onEnergySet(selectedEnergy);
        setIsExpanded(false);
    };

    return (
        <>
            {/* Collapsed Pill - Floating FAB */}
            <AnimatePresence>
                {!isExpanded && (
                    <motion.div
                        initial={{ opacity: 0, y: 50 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 50 }}
                        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40"
                    >
                        <button
                            onClick={() => setIsExpanded(true)}
                            className="flex items-center gap-3 px-1.5 py-1.5 pr-5 rounded-full bg-[var(--glass-bg)] backdrop-blur-xl border border-[var(--glass-border)] shadow-2xl hover:border-[var(--color-primary)]/30 hover:bg-[var(--glass-bg-hover)] transition-all group"
                        >
                            <div className="w-10 h-10 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center border border-[var(--color-primary)]/20 group-hover:scale-105 transition-transform">
                                <Activity className="w-5 h-5 text-[var(--color-primary)]" />
                            </div>

                            <div className="flex flex-col items-start">
                                <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide font-bold">Reality Intake</span>
                                <span className="text-xs font-medium text-[var(--text-primary)]">
                                    {currentEnergy ? `${energyLabels[currentEnergy - 1]} Energy` : 'Log Status'}
                                </span>
                            </div>
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Expanded Panel */}
            <AnimatePresence>
                {isExpanded && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[45]"
                            onClick={() => setIsExpanded(false)}
                        />

                        {/* Panel */}
                        <motion.div
                            initial={{ opacity: 0, y: 100 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 100 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            className="fixed bottom-0 left-0 right-0 z-[50] p-4 pb-8"
                        >
                            <GlassCard className="max-w-md mx-auto border-[var(--glass-border)] bg-[var(--color-bg-secondary)]/90">
                                <div className="flex justify-between items-center mb-6 pl-2">
                                    <div className="flex items-center gap-2">
                                        <Activity className="w-5 h-5 text-[var(--color-primary)]" />
                                        <h3 className="text-lg font-bold">System Check</h3>
                                    </div>
                                    <button
                                        onClick={() => setIsExpanded(false)}
                                        className="p-2 rounded-full hover:bg-[var(--glass-bg-hover)] transition-colors"
                                    >
                                        <X className="w-5 h-5 text-[var(--text-secondary)]" />
                                    </button>
                                </div>

                                {/* Energy Slider */}
                                <div className="space-y-8">
                                    {/* Visual Display */}
                                    <div className="text-center py-4 relative">
                                        <div className="absolute inset-0 bg-[var(--color-primary)]/5 blur-3xl rounded-full transform scale-75" />
                                        <motion.div
                                            key={selectedEnergy}
                                            initial={{ scale: 0.9, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            className="relative z-10"
                                        >
                                            <span className="text-4xl font-bold text-[var(--text-primary)] block mb-1">
                                                {energyLabels[selectedEnergy - 1]}
                                            </span>
                                            <span className="text-sm text-[var(--text-tertiary)] uppercase tracking-widest">Current Charge</span>
                                        </motion.div>
                                    </div>

                                    {/* Slider Input */}
                                    <div className="px-2">
                                        <input
                                            type="range"
                                            min="1"
                                            max="5"
                                            value={selectedEnergy}
                                            onChange={(e) => setSelectedEnergy(Number(e.target.value))}
                                            className="w-full h-2 rounded-full appearance-none cursor-pointer bg-[var(--glass-bg)]
                                                [&::-webkit-slider-thumb]:appearance-none
                                                [&::-webkit-slider-thumb]:w-6
                                                [&::-webkit-slider-thumb]:h-6
                                                [&::-webkit-slider-thumb]:rounded-full
                                                [&::-webkit-slider-thumb]:bg-[var(--color-primary)]
                                                [&::-webkit-slider-thumb]:shadow-[0_0_10px_var(--color-primary)]
                                                [&::-webkit-slider-thumb]:transition-transform
                                                [&::-webkit-slider-thumb]:hover:scale-110
                                            "
                                        />
                                        <div className="flex justify-between mt-4 px-1">
                                            {[1, 2, 3, 4, 5].map((level) => (
                                                <button
                                                    key={level}
                                                    onClick={() => setSelectedEnergy(level)}
                                                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all border ${selectedEnergy === level
                                                            ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                                                            : 'bg-transparent text-[var(--text-tertiary)] border-transparent hover:bg-[var(--glass-bg)]'
                                                        }`}
                                                >
                                                    {level}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="grid grid-cols-2 gap-3 pt-2">
                                        <Link href="/app/brain-dump" className="w-full">
                                            <button className="w-full py-3.5 px-4 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] flex items-center justify-center gap-2 hover:bg-[var(--glass-bg-hover)] transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                                                <Brain className="w-4 h-4" />
                                                <span className="text-sm font-medium">Brain Dump</span>
                                            </button>
                                        </Link>
                                        <button
                                            onClick={handleConfirm}
                                            className="w-full py-3.5 px-4 rounded-xl bg-[var(--color-primary)] text-white font-medium flex items-center justify-center gap-2 hover:bg-[var(--color-primary)]/90 transition-colors shadow-lg shadow-[var(--color-primary)]/20"
                                        >
                                            <Zap className="w-4 h-4" />
                                            <span className="text-sm">Log Energy</span>
                                        </button>
                                    </div>
                                </div>
                            </GlassCard>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    );
}
