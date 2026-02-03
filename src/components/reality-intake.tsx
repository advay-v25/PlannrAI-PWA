'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { useDailyLogStore } from '@/stores';
import { scheduleApi } from '@/lib/api-client';
import {
    Check,
    RotateCcw,
    X,
    SkipForward,
    Battery,
    BatteryLow,
    BatteryMedium,
    BatteryFull,
    Zap,
    MessageSquare,
    ChevronDown,
    ChevronUp,
} from 'lucide-react';

interface QuickLogProps {
    block: {
        id: string;
        title: string;
        goal?: { title: string; category: string };
        start_time: string;
        end_time: string;
        status: string;
    };
    onStatusChange?: (status: 'done' | 'partial' | 'missed' | 'skipped') => void;
}

const STATUS_OPTIONS = [
    {
        value: 'done' as const,
        label: 'Done',
        icon: Check,
        color: 'var(--color-success)',
        bgColor: 'var(--color-success-soft)',
    },
    {
        value: 'partial' as const,
        label: 'Partial',
        icon: RotateCcw,
        color: 'var(--color-warning)',
        bgColor: 'var(--color-warning-soft)',
    },
    {
        value: 'missed' as const,
        label: 'Missed',
        icon: X,
        color: 'var(--color-error)',
        bgColor: 'var(--color-error-soft)',
    },
    {
        value: 'skipped' as const,
        label: 'Skip',
        icon: SkipForward,
        color: 'var(--text-tertiary)',
        bgColor: 'var(--glass-bg)',
    },
];

/**
 * Quick Log Component - Reality Intake
 * Low-friction status logging for schedule blocks
 */
export function QuickLog({ block, onStatusChange }: QuickLogProps) {
    const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
    const [showReason, setShowReason] = useState(false);
    const [reason, setReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { setBlockStatus } = useDailyLogStore();

    const handleStatusSelect = async (status: 'done' | 'partial' | 'missed' | 'skipped') => {
        setSelectedStatus(status);

        // Show reason input for non-done statuses
        if (status !== 'done' && status !== 'skipped') {
            setShowReason(true);
            return;
        }

        // Submit immediately for done/skipped
        await submitLog(status);
    };

    const submitLog = async (status: 'done' | 'partial' | 'missed' | 'skipped') => {
        setIsSubmitting(true);

        try {
            // Update via API
            await scheduleApi.updateBlock(block.id, { status });

            // Update local state
            setBlockStatus(block.id, status);
            onStatusChange?.(status);

            setShowReason(false);
            setReason('');
        } catch (error) {
            console.error('Failed to log status:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const categoryColors: Record<string, string> = {
        mind: 'var(--color-mind)',
        body: 'var(--color-body)',
        future: 'var(--color-future)',
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-4"
        >
            {/* Block Info */}
            <div className="flex items-start gap-3 mb-4">
                <div
                    className="w-1 h-12 rounded-full"
                    style={{ backgroundColor: categoryColors[block.goal?.category || 'mind'] || 'var(--color-primary)' }}
                />
                <div className="flex-1">
                    <h4 className="font-medium text-[var(--text-primary)]">
                        {block.goal?.title || block.title}
                    </h4>
                    <p className="text-sm text-[var(--text-tertiary)]">
                        {block.start_time} - {block.end_time}
                    </p>
                </div>
            </div>

            {/* Status Buttons */}
            <div className="grid grid-cols-4 gap-2">
                {STATUS_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    const isSelected = selectedStatus === option.value;

                    return (
                        <motion.button
                            key={option.value}
                            onClick={() => handleStatusSelect(option.value)}
                            className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl transition-all ${isSelected ? 'ring-2' : ''
                                }`}
                            style={{
                                backgroundColor: isSelected ? option.bgColor : 'var(--glass-bg)',
                                color: isSelected ? option.color : 'var(--text-secondary)',
                                // @ts-expect-error - CSS custom property for ring color
                                '--tw-ring-color': option.color,
                            }}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            disabled={isSubmitting}
                        >
                            <Icon className="w-5 h-5" />
                            <span className="text-xs font-medium">{option.label}</span>
                        </motion.button>
                    );
                })}
            </div>

            {/* Reason Input (for partial/missed) */}
            <AnimatePresence>
                {showReason && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="mt-4 space-y-3">
                            <input
                                type="text"
                                placeholder="Quick note (optional)..."
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                className="w-full p-3 bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl text-sm focus:outline-none focus:border-[var(--color-primary)]"
                                autoFocus
                            />
                            <div className="flex gap-2">
                                <GlassButton
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        setShowReason(false);
                                        setSelectedStatus(null);
                                    }}
                                    className="flex-1"
                                >
                                    Cancel
                                </GlassButton>
                                <GlassButton
                                    variant="primary"
                                    size="sm"
                                    onClick={() => submitLog(selectedStatus as 'partial' | 'missed')}
                                    loading={isSubmitting}
                                    className="flex-1"
                                >
                                    Log
                                </GlassButton>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

/**
 * Energy Check Component
 * Quick energy level capture for the day
 */
interface EnergyCheckProps {
    onEnergySet?: (level: number) => void;
}

const ENERGY_LEVELS = [
    { level: 1, icon: BatteryLow, label: 'Very Low', color: 'var(--color-error)' },
    { level: 2, icon: BatteryLow, label: 'Low', color: 'var(--color-warning)' },
    { level: 3, icon: BatteryMedium, label: 'Medium', color: 'var(--color-primary)' },
    { level: 4, icon: BatteryFull, label: 'Good', color: 'var(--color-success)' },
    { level: 5, icon: Zap, label: 'High', color: 'var(--color-success)' },
];

export function EnergyCheck({ onEnergySet }: EnergyCheckProps) {
    const [selectedLevel, setSelectedLevel] = useState<number | null>(null);
    const { updateEnergy } = useDailyLogStore();

    const handleSelect = (level: number) => {
        setSelectedLevel(level);
        updateEnergy(level);
        onEnergySet?.(level);
    };

    return (
        <div className="glass-card p-4">
            <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-3">
                How's your energy today?
            </h4>
            <div className="flex gap-2">
                {ENERGY_LEVELS.map((item) => {
                    const Icon = item.icon;
                    const isSelected = selectedLevel === item.level;

                    return (
                        <motion.button
                            key={item.level}
                            onClick={() => handleSelect(item.level)}
                            className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-xl transition-all ${isSelected ? 'ring-2' : 'bg-[var(--glass-bg)]'
                                }`}
                            style={{
                                backgroundColor: isSelected ? `${item.color}15` : undefined,
                                color: isSelected ? item.color : 'var(--text-tertiary)',
                                // @ts-expect-error - CSS custom property for ring color
                                '--tw-ring-color': item.color,
                            }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                        >
                            <Icon className="w-5 h-5" />
                            <span className="text-xs">{item.level}</span>
                        </motion.button>
                    );
                })}
            </div>
            {selectedLevel && (
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-xs text-center mt-2"
                    style={{ color: ENERGY_LEVELS[selectedLevel - 1].color }}
                >
                    {ENERGY_LEVELS[selectedLevel - 1].label} energy
                </motion.p>
            )}
        </div>
    );
}

/**
 * Today's Blocks Summary
 * Shows all blocks for the day with quick log options
 */
interface TodayBlocksProps {
    blocks: Array<{
        id: string;
        title: string;
        goal?: { title: string; category: string };
        start_time: string;
        end_time: string;
        status: string;
    }>;
}

export function TodayBlocksSummary({ blocks }: TodayBlocksProps) {
    const [isExpanded, setIsExpanded] = useState(true);
    const { blockStatuses } = useDailyLogStore();

    const pendingBlocks = blocks.filter(b =>
        b.status === 'planned' && !blockStatuses.has(b.id)
    );
    const loggedBlocks = blocks.filter(b =>
        b.status !== 'planned' || blockStatuses.has(b.id)
    );

    const doneCount = loggedBlocks.filter(b =>
        b.status === 'done' || blockStatuses.get(b.id) === 'done'
    ).length;

    return (
        <div className="space-y-4">
            {/* Summary Header */}
            <div className="glass-card p-4">
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full flex items-center justify-between"
                >
                    <div>
                        <h3 className="text-subheading">Today's Progress</h3>
                        <p className="text-caption">
                            {doneCount} of {blocks.length} blocks completed
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Progress Ring */}
                        <div className="relative w-12 h-12">
                            <svg className="w-12 h-12 -rotate-90">
                                <circle
                                    cx="24"
                                    cy="24"
                                    r="20"
                                    fill="none"
                                    stroke="var(--glass-border)"
                                    strokeWidth="4"
                                />
                                <circle
                                    cx="24"
                                    cy="24"
                                    r="20"
                                    fill="none"
                                    stroke="var(--color-success)"
                                    strokeWidth="4"
                                    strokeLinecap="round"
                                    strokeDasharray={`${(doneCount / blocks.length) * 126} 126`}
                                />
                            </svg>
                            <span className="absolute inset-0 flex items-center justify-center text-xs font-medium">
                                {blocks.length > 0 ? Math.round((doneCount / blocks.length) * 100) : 0}%
                            </span>
                        </div>
                        {isExpanded ? (
                            <ChevronUp className="w-5 h-5 text-[var(--text-tertiary)]" />
                        ) : (
                            <ChevronDown className="w-5 h-5 text-[var(--text-tertiary)]" />
                        )}
                    </div>
                </button>
            </div>

            {/* Pending Blocks */}
            <AnimatePresence>
                {isExpanded && pendingBlocks.length > 0 && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="space-y-3"
                    >
                        <p className="text-overline px-1">Needs logging</p>
                        {pendingBlocks.slice(0, 3).map((block) => (
                            <QuickLog key={block.id} block={block} />
                        ))}
                        {pendingBlocks.length > 3 && (
                            <p className="text-caption text-center">
                                +{pendingBlocks.length - 3} more
                            </p>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
