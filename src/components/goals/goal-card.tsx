import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Sparkles,
    Play,
    Pause,
    Trash2,
    Loader2,
    Calendar,
    MoreHorizontal,
    Maximize2,
    Minimize2,
    Target
} from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { GlassInput } from '@/components/ui/glass-input';
import type { Goal } from '@/types/database';

interface GoalCardProps {
    goal: Goal;
    onUpdate: (id: string, updates: Partial<Goal>) => void;
    onDelete: (id: string) => void;
    onOpenStrategy: (goal: Goal) => void;
    pillarColor: string;
}

export function GoalCard({ goal, onUpdate, onDelete, onOpenStrategy, pillarColor }: GoalCardProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const isPaused = goal.status === 'paused';

    return (
        <GlassCard
            className={`transition-all duration-300 ${isExpanded ? 'ring-1 ring-[var(--color-primary)] shadow-lg' : 'hover:bg-[var(--glass-bg-hover)]'}`}
            padding="none"
        >
            {/* Header / Summary View */}
            <div
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-4 flex items-center justify-between cursor-pointer"
            >
                <div className="flex items-center gap-3">
                    {/* Status Indicator Bar */}
                    <div
                        className={`w-1.5 h-10 rounded-full transition-colors`}
                        style={{ backgroundColor: isPaused ? 'var(--text-disabled)' : pillarColor }}
                    />

                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className={`font-semibold text-base ${isPaused ? 'text-[var(--text-tertiary)] line-through decoration-2' : 'text-[var(--text-primary)]'}`}>
                                {goal.title}
                            </h3>
                            {goal.ai_strategy && Object.keys(goal.ai_strategy).length > 0 && (
                                <span className="px-1.5 py-0.5 text-[9px] uppercase font-bold tracking-wider bg-gradient-to-r from-[var(--color-primary)]/20 to-purple-500/20 text-[var(--color-primary)] rounded border border-[var(--color-primary)]/20">
                                    AI Strategy
                                </span>
                            )}
                        </div>

                        {!isExpanded && (
                            <div className="flex items-center gap-3 text-xs text-[var(--text-tertiary)] mt-1">
                                <span className="font-mono">{goal.minutes_per_day}m/day</span>
                                <span className="w-1 h-1 rounded-full bg-[var(--text-tertiary)]/30" />
                                <span className="capitalize">{goal.days_per_week || 7} days/wk</span>
                                <span className="w-1 h-1 rounded-full bg-[var(--text-tertiary)]/30" />
                                <span className={`uppercase font-bold text-[10px] ${goal.energy_demand === 'heavy' ? 'text-orange-400' :
                                    goal.energy_demand === 'light' ? 'text-green-400' : 'text-blue-400'
                                    }`}>
                                    {goal.energy_demand}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={(e) => { e.stopPropagation(); onOpenStrategy(goal); }}
                        className={`p-2 rounded-full transition-all group ${goal.ai_strategy
                            ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20'
                            : 'hover:bg-[var(--glass-bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--color-primary)]'
                            }`}
                        title="AI Strategy"
                    >
                        <Sparkles className={`w-4 h-4 ${!goal.ai_strategy && 'group-hover:scale-110 transition-transform'}`} />
                    </button>

                    <button className="p-2 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">
                        {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            {/* Expanded Content */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-[var(--glass-border)] bg-[var(--glass-bg-subtle)]"
                    >
                        <div className="p-5 space-y-6">
                            {/* Title Input */}
                            <div className="space-y-1">
                                <label className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] tracking-wider">Goal Title</label>
                                <GlassInput
                                    value={goal.title}
                                    onChange={(e) => onUpdate(goal.id, { title: e.target.value })}
                                    className="font-medium bg-[var(--glass-bg)] border-transparent focus:border-[var(--color-primary)] focus:bg-[var(--glass-bg-hover)]"
                                />
                            </div>

                            {/* Key Stats Sliders */}
                            <div className="grid grid-cols-2 gap-6">
                                {/* Duration Slider */}
                                <div className="space-y-2">
                                    <div className="flex justify-between">
                                        <label className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] tracking-wider">Duration (min)</label>
                                        <span className="text-xs font-mono font-bold text-[var(--color-primary)]">{goal.minutes_per_day}m</span>
                                    </div>
                                    <input
                                        type="range" min={5} max={180} step={5}
                                        value={goal.minutes_per_day || 0}
                                        onChange={(e) => onUpdate(goal.id, { minutes_per_day: Number(e.target.value) })}
                                        className="w-full accent-[var(--color-primary)] h-1.5 bg-[var(--glass-border)] rounded-lg appearance-none cursor-pointer"
                                    />
                                    <div className="flex justify-between text-[10px] text-[var(--text-tertiary)]">
                                        <span>5m</span>
                                        <span>3h</span>
                                    </div>
                                </div>

                                {/* Frequency Slider */}
                                <div className="space-y-2">
                                    <div className="flex justify-between">
                                        <label className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] tracking-wider">Frequency</label>
                                        <span className="text-xs font-mono font-bold text-[var(--color-primary)]">{goal.days_per_week || 7}d/wk</span>
                                    </div>
                                    <input
                                        type="range" min={1} max={7} step={1}
                                        value={goal.days_per_week || 7}
                                        onChange={(e) => onUpdate(goal.id, { days_per_week: Number(e.target.value) })}
                                        className="w-full accent-[var(--color-primary)] h-1.5 bg-[var(--glass-border)] rounded-lg appearance-none cursor-pointer"
                                    />
                                    <div className="flex justify-between text-[10px] text-[var(--text-tertiary)]">
                                        <span>1d</span>
                                        <span>7d</span>
                                    </div>
                                </div>
                            </div>

                            {/* Toggles (Energy & Priority) */}
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] tracking-wider">Energy Demand</label>
                                    <div className="flex bg-[var(--glass-bg)] p-1 rounded-lg border border-[var(--glass-border)]">
                                        {(['light', 'medium', 'heavy'] as const).map(e => (
                                            <button
                                                key={e}
                                                onClick={() => onUpdate(goal.id, { energy_demand: e })}
                                                className={`flex-1 text-[10px] font-medium py-1.5 rounded-md transition-all ${goal.energy_demand === e
                                                    ? 'bg-[var(--glass-border)] text-[var(--text-primary)] shadow-sm'
                                                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                                                    }`}
                                            >
                                                {e}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] tracking-wider">Priority</label>
                                    <div className="flex bg-[var(--glass-bg)] p-1 rounded-lg border border-[var(--glass-border)]">
                                        {(['low', 'medium', 'high'] as const).map(p => (
                                            <button
                                                key={p}
                                                onClick={() => onUpdate(goal.id, { importance: p })}
                                                className={`flex-1 text-[10px] font-medium py-1.5 rounded-md transition-all ${goal.importance === p
                                                    ? 'bg-[var(--glass-border)] text-[var(--text-primary)] shadow-sm'
                                                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                                                    }`}
                                            >
                                                {p}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Buttons */}
                            <div className="flex gap-3 pt-2">
                                <GlassButton
                                    variant="ghost"
                                    className="flex-1 justify-center border border-dashed border-[var(--color-primary)]/30 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/5"
                                    onClick={() => onOpenStrategy(goal)}
                                >
                                    <Sparkles className="w-4 h-4 mr-2" />
                                    {goal.ai_strategy ? 'View Expert Strategy' : 'Generate Expert Strategy'}
                                </GlassButton>

                                <GlassButton
                                    variant="ghost"
                                    className="flex-[0.3] justify-center border border-dashed border-[var(--text-tertiary)]/30 text-[var(--text-secondary)] hover:bg-[var(--text-secondary)]/5"
                                    onClick={() => window.location.href = `/app/goals/${goal.id}`}
                                >
                                    <Target className="w-4 h-4 mr-2" />
                                    Plan
                                </GlassButton>
                            </div>

                            {/* Footer Actions */}
                            <div className="flex justify-between items-center pt-4 border-t border-[var(--glass-border)]">
                                <button
                                    onClick={() => onUpdate(goal.id, { status: isPaused ? 'active' : 'paused' })}
                                    className={`flex items-center gap-2 text-xs font-bold transition-colors ${isPaused ? 'text-[var(--color-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                                >
                                    {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                                    {isPaused ? 'Resume Goal' : 'Pause Goal'}
                                </button>

                                <button
                                    onClick={() => onDelete(goal.id)}
                                    className="flex items-center gap-2 text-xs font-medium text-[var(--text-tertiary)] hover:text-red-400 transition-colors"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Delete
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </GlassCard>
    );
}
