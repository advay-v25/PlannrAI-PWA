'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import {
    Zap, Brain, X, Activity, Send, Loader2,
    ArrowRight, Undo2, CheckCircle2, AlertCircle
} from 'lucide-react';
import Link from 'next/link';
import type { ScheduleBlock, Goal } from '@/types/database';
import { apiClient } from '@/lib/api-client';
import type { Patch } from '@/lib/ai/schemas';

interface MutationOption {
    id: string;
    title: string;
    impact: string;
    patch: Patch;
}

interface RealityIntakeProps {
    currentEnergy?: number;
    onEnergySet: (level: number) => void;
    todayBlocks?: ScheduleBlock[];
    goals?: Goal[];
    onBlocksUpdated?: () => void;
}

export function RealityIntake({
    currentEnergy,
    onEnergySet,
    todayBlocks = [],
    goals = [],
    onBlocksUpdated,
}: RealityIntakeProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [selectedEnergy, setSelectedEnergy] = useState(currentEnergy || 3);

    // Text input + AI state
    const [textInput, setTextInput] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const [aiOptions, setAiOptions] = useState<MutationOption[]>([]);
    const [aiSummary, setAiSummary] = useState('');
    const [isApplying, setIsApplying] = useState(false);
    const [lastVersionId, setLastVersionId] = useState<string | null>(null);
    const [appliedOption, setAppliedOption] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const energyLabels = ['Depleted', 'Low', 'Moderate', 'Good', 'Peak'];

    const energyToState = (level: number) => {
        if (level <= 2) return 'low';
        if (level <= 3) return 'medium';
        return 'high';
    };

    const handleConfirm = () => {
        onEnergySet(selectedEnergy);
        setIsExpanded(false);
    };

    const handleTextSubmit = async () => {
        if (!textInput.trim()) return;

        setIsThinking(true);
        setError(null);
        setAiOptions([]);
        setAiSummary('');
        setAppliedOption(null);

        try {
            const aiData = await apiClient.ai.execute({
                channel: 'home',
                input: textInput,
                context: {
                    current_schedule: todayBlocks.map(b => ({
                        id: b.id,
                        title: b.title || b.context,
                        start_time: b.start_time,
                        end_time: b.end_time,
                        block_type: b.block_type,
                        is_fixed: b.is_fixed,
                        status: b.status,
                    })),
                    goals: goals.map(g => ({
                        id: g.id,
                        title: g.title,
                        category: g.category,
                        importance: g.importance,
                    })),
                    user_state: { energy: energyToState(selectedEnergy) },
                }
            });

            if (aiData.summary) {
                setAiSummary(aiData.summary);
            }

            if (aiData.mode === 'propose' && aiData.options?.length > 0) {
                // Map AI options to mutation options
                const mapped: MutationOption[] = aiData.options.map((opt: any) => ({
                    id: opt.id || crypto.randomUUID(),
                    title: opt.title || 'Untitled Option',
                    impact: opt.impact || 'Unknown',
                    patch: opt.patch
                }));
                setAiOptions(mapped);
            } else if (aiData.mode === 'refuse') {
                setError(aiData.refusal?.reason || 'AI could not process this request.');
            }
        } catch (err: any) {
            setError(err.message || 'Failed to process. Please try again.');
            console.error('[RealityIntake] AI error:', err);
        } finally {
            setIsThinking(false);
        }
    };

    const handleApplyOption = async (option: MutationOption) => {
        setIsApplying(true);
        setError(null);
        try {
            const data = await apiClient.patch.apply(option.patch, 'reality_intake');

            if (data.versionId) {
                setLastVersionId(data.versionId);
            }
            setAppliedOption(option.id);
            onBlocksUpdated?.();
        } catch (err) {
            setError('Failed to apply changes.');
            console.error('[RealityIntake] Apply error:', err);
        } finally {
            setIsApplying(false);
        }
    };

    const handleUndo = async () => {
        if (!lastVersionId && !appliedOption) return;
        try {
            await apiClient.patch.undo();
            setLastVersionId(null);
            setAppliedOption(null);
            setAiOptions([]);
            setAiSummary('');
            setTextInput('');
            onBlocksUpdated?.();
        } catch (err) {
            console.error('[RealityIntake] Undo error:', err);
        }
    };

    const resetState = () => {
        setAiOptions([]);
        setAiSummary('');
        setTextInput('');
        setAppliedOption(null);
        setError(null);
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

                                <div className="space-y-6">
                                    {/* Reality Text Input */}
                                    <div className="space-y-2">
                                        <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider font-bold px-2">
                                            What's changed?
                                        </label>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={textInput}
                                                onChange={(e) => setTextInput(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleTextSubmit()}
                                                placeholder="I'm busy at 4pm, meeting ran late…"
                                                className="flex-1 px-4 py-3 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--color-primary)]/40 transition-colors"
                                                disabled={isThinking || !!appliedOption}
                                            />
                                            <button
                                                onClick={handleTextSubmit}
                                                disabled={!textInput.trim() || isThinking || !!appliedOption}
                                                className="p-3 rounded-xl bg-[var(--color-primary)] text-white disabled:opacity-40 hover:bg-[var(--color-primary)]/90 transition-colors"
                                            >
                                                {isThinking ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <Send className="w-4 h-4" />
                                                )}
                                            </button>
                                        </div>
                                    </div>

                                    {/* AI Response Options */}
                                    <AnimatePresence mode="wait">
                                        {aiSummary && !appliedOption && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -10 }}
                                                className="space-y-3"
                                            >
                                                <p className="text-sm text-[var(--text-secondary)] px-2">
                                                    {aiSummary}
                                                </p>
                                                {aiOptions.map((option) => (
                                                    <motion.button
                                                        key={option.id}
                                                        onClick={() => handleApplyOption(option)}
                                                        disabled={isApplying}
                                                        className="w-full p-3 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] hover:border-[var(--color-primary)]/30 transition-all text-left group"
                                                        whileHover={{ scale: 1.01 }}
                                                        whileTap={{ scale: 0.99 }}
                                                    >
                                                        <div className="flex items-center justify-between">
                                                            <div>
                                                                <p className="text-sm font-medium text-[var(--text-primary)]">{option.title}</p>
                                                                <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{option.impact}</p>
                                                            </div>
                                                            <ArrowRight className="w-4 h-4 text-[var(--text-tertiary)] group-hover:text-[var(--color-primary)] transition-colors" />
                                                        </div>
                                                    </motion.button>
                                                ))}
                                            </motion.div>
                                        )}

                                        {/* Applied Success */}
                                        {appliedOption && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="space-y-3"
                                            >
                                                <div className="flex items-center gap-2 px-2">
                                                    <CheckCircle2 className="w-4 h-4 text-[var(--color-success)]" />
                                                    <p className="text-sm text-[var(--color-success)] font-medium">Schedule updated</p>
                                                </div>
                                                <div className="flex gap-2">
                                                    <GlassButton variant="ghost" size="sm" onClick={handleUndo} className="flex-1">
                                                        <Undo2 className="w-4 h-4 mr-1" /> Undo
                                                    </GlassButton>
                                                    <GlassButton variant="primary" size="sm" onClick={resetState} className="flex-1">
                                                        Done
                                                    </GlassButton>
                                                </div>
                                            </motion.div>
                                        )}

                                        {/* Error */}
                                        {error && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/20"
                                            >
                                                <AlertCircle className="w-4 h-4 text-[var(--color-warning)] flex-shrink-0" />
                                                <p className="text-xs text-[var(--color-warning)]">{error}</p>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    {/* Energy Slider */}
                                    <div className="text-center py-2 relative">
                                        <div className="absolute inset-0 bg-[var(--color-primary)]/5 blur-3xl rounded-full transform scale-75" />
                                        <motion.div
                                            key={selectedEnergy}
                                            initial={{ scale: 0.9, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            className="relative z-10"
                                        >
                                            <span className="text-3xl font-bold text-[var(--text-primary)] block mb-0.5">
                                                {energyLabels[selectedEnergy - 1]}
                                            </span>
                                            <span className="text-xs text-[var(--text-tertiary)] uppercase tracking-widest">Current Charge</span>
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
                                        <div className="flex justify-between mt-3 px-1">
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
