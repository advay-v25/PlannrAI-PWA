'use client';

import { useState } from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { GlassCard } from '@/components/ui/glass-card';
import { Zap, Brain, ChevronUp, X } from 'lucide-react';
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
        'var(--color-error)',
        'var(--color-warning)',
        'var(--color-primary)',
        'var(--color-success)',
        'var(--color-future)'
    ];

    const handleConfirm = () => {
        onEnergySet(selectedEnergy);
        setIsExpanded(false);
    };

    return (
        <>
            {/* Collapsed Pill */}
            <AnimatePresence>
                {!isExpanded && (
                    <motion.div
                        initial={{ opacity: 0, y: 50 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 50 }}
                        className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40"
                    >
                        <button
                            onClick={() => setIsExpanded(true)}
                            className="flex items-center gap-3 px-5 py-3 rounded-full bg-[var(--glass-bg)] backdrop-blur-xl border border-white/10 shadow-2xl hover:border-white/20 transition-all group"
                        >
                            <div className="relative">
                                <Zap
                                    className="w-5 h-5 transition-colors"
                                    style={{ color: currentEnergy ? energyColors[currentEnergy - 1] : 'var(--text-tertiary)' }}
                                />
                                {currentEnergy && (
                                    <span
                                        className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-[var(--glass-bg)]"
                                        style={{ backgroundColor: energyColors[currentEnergy - 1] }}
                                    />
                                )}
                            </div>
                            <span className="text-sm font-medium">
                                {currentEnergy ? energyLabels[currentEnergy - 1] : 'Log Energy'}
                            </span>
                            <ChevronUp className="w-4 h-4 text-[var(--text-tertiary)] group-hover:text-white transition-colors" />
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
                            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
                            onClick={() => setIsExpanded(false)}
                        />

                        {/* Panel */}
                        <motion.div
                            initial={{ opacity: 0, y: 100 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 100 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-8"
                        >
                            <GlassCard padding="lg" className="max-w-md mx-auto">
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-lg font-bold">How's Your Energy?</h3>
                                    <button
                                        onClick={() => setIsExpanded(false)}
                                        className="p-2 rounded-full hover:bg-white/10 transition-colors"
                                    >
                                        <X className="w-5 h-5 text-[var(--text-tertiary)]" />
                                    </button>
                                </div>

                                {/* Energy Slider */}
                                <div className="space-y-6">
                                    {/* Visual Display */}
                                    <div className="text-center">
                                        <motion.div
                                            key={selectedEnergy}
                                            initial={{ scale: 0.8, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl mb-2"
                                            style={{ backgroundColor: `${energyColors[selectedEnergy - 1]}20` }}
                                        >
                                            <Zap className="w-6 h-6" style={{ color: energyColors[selectedEnergy - 1] }} />
                                            <span className="text-2xl font-bold" style={{ color: energyColors[selectedEnergy - 1] }}>
                                                {energyLabels[selectedEnergy - 1]}
                                            </span>
                                        </motion.div>
                                    </div>

                                    {/* Slider Track */}
                                    <div className="relative">
                                        <input
                                            type="range"
                                            min="1"
                                            max="5"
                                            value={selectedEnergy}
                                            onChange={(e) => setSelectedEnergy(Number(e.target.value))}
                                            className="w-full h-2 bg-white/10 rounded-full appearance-none cursor-pointer
                                                [&::-webkit-slider-thumb]:appearance-none
                                                [&::-webkit-slider-thumb]:w-6
                                                [&::-webkit-slider-thumb]:h-6
                                                [&::-webkit-slider-thumb]:rounded-full
                                                [&::-webkit-slider-thumb]:bg-white
                                                [&::-webkit-slider-thumb]:shadow-lg
                                                [&::-webkit-slider-thumb]:cursor-grab
                                                [&::-webkit-slider-thumb]:active:cursor-grabbing
                                            "
                                            style={{
                                                background: `linear-gradient(to right, ${energyColors[selectedEnergy - 1]} ${((selectedEnergy - 1) / 4) * 100}%, rgba(255,255,255,0.1) ${((selectedEnergy - 1) / 4) * 100}%)`
                                            }}
                                        />
                                        <div className="flex justify-between mt-2 px-1">
                                            {[1, 2, 3, 4, 5].map((level) => (
                                                <button
                                                    key={level}
                                                    onClick={() => setSelectedEnergy(level)}
                                                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${selectedEnergy === level
                                                            ? 'bg-white text-black scale-110'
                                                            : 'bg-white/10 text-[var(--text-tertiary)] hover:bg-white/20'
                                                        }`}
                                                >
                                                    {level}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex gap-3 pt-2">
                                        <Link href="/app/brain-dump" className="flex-1">
                                            <button className="w-full py-3 px-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center gap-2 hover:bg-white/10 transition-colors">
                                                <Brain className="w-4 h-4 text-[var(--color-mind)]" />
                                                <span className="text-sm">Brain Dump</span>
                                            </button>
                                        </Link>
                                        <button
                                            onClick={handleConfirm}
                                            className="flex-1 py-3 px-4 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors"
                                            style={{
                                                backgroundColor: energyColors[selectedEnergy - 1],
                                                color: selectedEnergy >= 4 ? 'black' : 'white'
                                            }}
                                        >
                                            <Zap className="w-4 h-4" />
                                            <span className="text-sm">Confirm</span>
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
