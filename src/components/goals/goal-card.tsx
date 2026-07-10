import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
    Target,
    Zap
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
    const router = useRouter();
    const [isExpanded, setIsExpanded] = useState(false);
    const [isPreview, setIsPreview] = useState(false);
    useEffect(() => {
        import('@/lib/featureFlags').then(m => setIsPreview(m.isPreviewEnabled()));
    }, []);

    // Local buffering for inputs to prevent API spam on every keystroke/pixel drag
    const [localTitle, setLocalTitle] = useState(goal.title || '');
    const [localDaysPerWeek, setLocalDaysPerWeek] = useState(goal.days_per_week || Math.max(1, Math.round((goal.weekly_target_minutes || 0) / 60)));
    const [localMinsPerDay, setLocalMinsPerDay] = useState(goal.minutes_per_day || Math.max(15, Math.round((goal.weekly_target_minutes || 0) / (goal.days_per_week || 1))));

    // Sync local state if external goal prop changes
    useEffect(() => {
        setLocalTitle(goal.title || '');
        setLocalDaysPerWeek(goal.days_per_week || Math.max(1, Math.round((goal.weekly_target_minutes || 0) / 60)));
        setLocalMinsPerDay(goal.minutes_per_day || Math.max(15, Math.round((goal.weekly_target_minutes || 0) / (goal.days_per_week || 1))));
    }, [goal.title, goal.weekly_target_minutes, goal.days_per_week, goal.minutes_per_day]);

    const handleTargetUpdate = () => {
        const weekly_target_minutes = localDaysPerWeek * localMinsPerDay;
        if (weekly_target_minutes !== goal.weekly_target_minutes || localDaysPerWeek !== goal.days_per_week || localMinsPerDay !== goal.minutes_per_day) {
            onUpdate(goal.id, { 
                weekly_target_minutes, 
                days_per_week: localDaysPerWeek, 
                minutes_per_day: localMinsPerDay 
            });
        }
    };

    const isPaused = goal.status === 'paused';

    return (
        <GlassCard
            className={`group transition-all duration-300 ${isExpanded ? 'ring-1 ring-[var(--color-primary)] shadow-lg' : 'hover:-translate-y-1 hover:shadow-xl hover:bg-[var(--glass-bg-hover)]'}`}
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
                        className={`w-1 h-8 rounded-full transition-colors`}
                        style={{ backgroundColor: isPaused ? 'var(--text-disabled)' : pillarColor }}
                    />

                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className={`font-bold text-xl ${isPaused ? 'text-[var(--text-tertiary)] line-through decoration-2' : 'text-[var(--text-primary)]'}`}>
                                {goal.title}
                            </h3>
                            {goal.ai_strategy && Object.keys(goal.ai_strategy).length > 0 && (
                                <span className="px-1.5 py-0.5 text-[9px] uppercase font-bold tracking-wider bg-[var(--glass-bg)] text-[var(--text-primary)] rounded border border-white/20">
                                    AI Strategy
                                </span>
                            )}
                        </div>

                        {!isExpanded && (
                            <div className="mt-2 space-y-3">
                                <div className="flex items-center gap-3 text-xs text-[var(--text-tertiary)]">
                                    <span className="font-mono text-[var(--text-secondary)]"><span style={{ color: pillarColor }}>{goal.weekly_target_minutes || 0}m</span>/wk</span>
                                </div>
                                {/* Weekly Progress Bar */}
                                {(goal.weekly_target_minutes || 0) > 0 && (() => {
                                    const achieved = goal.total_completed_minutes || 0;
                                    const target = goal.weekly_target_minutes || 1;
                                    const pct = Math.min(100, Math.round((achieved / target) * 100));
                                    
                                    return (
                                        <div className="flex items-center gap-3">
                                            <div className="flex-1 h-2 bg-[var(--glass-bg)] rounded-full overflow-hidden relative shadow-inner">
                                                {pct > 0 && (
                                                    <motion.div
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${pct}%` }}
                                                        transition={{ duration: 1, ease: "easeOut" }}
                                                        className="absolute top-0 left-0 h-full rounded-full"
                                                        style={{
                                                            backgroundColor: pillarColor,
                                                            boxShadow: `0 0 10px ${pillarColor}80`
                                                        }}
                                                    />
                                                )}
                                            </div>
                                            <span className="text-[10px] font-mono font-bold tracking-wider text-[var(--text-secondary)] min-w-[28px] text-right">
                                                {pct}%
                                            </span>
                                        </div>
                                    );
                                })()}
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-3 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={(e) => { 
                            e.stopPropagation(); 
                            if (isPreview) onOpenStrategy(goal); 
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all text-xs font-semibold ${goal.ai_strategy
                            ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20'
                            : 'bg-[var(--glass-bg)] hover:bg-[var(--glass-bg)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                            } ${!isPreview && 'opacity-50 cursor-not-allowed hover:text-[var(--text-tertiary)] hover:bg-transparent'}`}
                        title={isPreview ? "AI Strategy" : "Pro Feature - Coming Soon"}
                    >
                        <Sparkles className="w-3.5 h-3.5" />
                        ✨ Strategy
                    </button>

                    <button className="text-xs font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
                        {isExpanded ? "Close" : "View →"}
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
                            {/* Title & Category Input */}
                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-1 col-span-2">
                                    <label className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] tracking-wider">Goal Title</label>
                                    <GlassInput
                                        value={localTitle}
                                        onChange={(e) => setLocalTitle(e.target.value)}
                                        onBlur={() => {
                                            if (localTitle !== goal.title) {
                                                onUpdate(goal.id, { title: localTitle });
                                            }
                                        }}
                                        className="font-medium bg-[var(--glass-bg)] border border-[var(--glass-border)] focus:border-white/30 text-[var(--text-primary)] h-10 transition-colors"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] tracking-wider">Pillar</label>
                                    <select
                                        value={goal.category || 'mind'}
                                        onChange={(e) => onUpdate(goal.id, { category: e.target.value as any })}
                                        className="w-full h-10 px-3 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] focus:border-white/30 text-[var(--text-primary)] text-sm font-medium outline-none appearance-none cursor-pointer transition-colors"
                                    >
                                        <option value="mind" className="bg-[#121212]">Mind</option>
                                        <option value="body" className="bg-[#121212]">Body</option>
                                        <option value="craft" className="bg-[#121212]">Craft</option>
                                    </select>
                                </div>
                            </div>

                            {/* Sliders & Toggles */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Duration Sliders */}
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <div className="flex justify-between">
                                            <label className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] tracking-wider">Days / Week</label>
                                            <span className="text-xs font-mono font-bold" style={{ color: pillarColor }}>
                                                {localDaysPerWeek}d
                                            </span>
                                        </div>
                                        <input
                                            type="range" min={1} max={7} step={1}
                                            value={localDaysPerWeek}
                                            onChange={(e) => setLocalDaysPerWeek(Number(e.target.value))}
                                            onMouseUp={handleTargetUpdate}
                                            onTouchEnd={handleTargetUpdate}
                                            className="w-full h-1.5 bg-[var(--glass-border)] rounded-lg appearance-none cursor-pointer"
                                            style={{ accentColor: pillarColor }}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex justify-between">
                                            <label className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] tracking-wider">Daily Mins</label>
                                            <span className="text-xs font-mono font-bold" style={{ color: pillarColor }}>
                                                {localMinsPerDay}m
                                            </span>
                                        </div>
                                        <input
                                            type="range" min={5} max={180} step={5}
                                            value={localMinsPerDay}
                                            onChange={(e) => setLocalMinsPerDay(Number(e.target.value))}
                                            onMouseUp={handleTargetUpdate}
                                            onTouchEnd={handleTargetUpdate}
                                            className="w-full h-1.5 bg-[var(--glass-border)] rounded-lg appearance-none cursor-pointer"
                                            style={{ accentColor: pillarColor }}
                                        />
                                    </div>
                                </div>

                                {/* Toggles (Energy & Priority) */}
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] tracking-wider">Energy Demand</label>
                                        <div className="flex bg-[var(--glass-bg)] p-1 rounded-lg border border-[var(--glass-border)]">
                                            {(['light', 'medium', 'heavy'] as const).map(e => (
                                                <button
                                                    key={e}
                                                    onClick={() => onUpdate(goal.id, { energy_demand: e })}
                                                    className={`flex-1 text-[10px] font-medium py-1.5 rounded-md transition-all ${goal.energy_demand === e
                                                        ? 'shadow-sm'
                                                        : 'text-[var(--text-secondary)] bg-[var(--glass-bg)] hover:text-[var(--text-primary)]'
                                                        }`}
                                                    style={goal.energy_demand === e ? { backgroundColor: pillarColor, color: 'white' } : {}}
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
                                                        ? 'shadow-sm'
                                                        : 'text-[var(--text-secondary)] bg-[var(--glass-bg)] hover:text-[var(--text-primary)]'
                                                        }`}
                                                    style={goal.importance === p ? { backgroundColor: pillarColor, color: 'white' } : {}}
                                                >
                                                    {p}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Buttons */}
                            <div className="flex gap-3 pt-2">
                                <GlassButton
                                    variant="ghost"
                                    className={`flex-1 justify-center border border-dashed border-[var(--color-primary)]/30 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 ${!isPreview && 'opacity-50 cursor-not-allowed hover:bg-transparent'}`}
                                    onClick={(e) => {
                                        if (isPreview) {
                                            onOpenStrategy(goal);
                                        } else {
                                            e.preventDefault();
                                        }
                                    }}
                                >
                                    <Sparkles className="w-4 h-4 mr-2" />
                                    {goal.ai_strategy ? 'View Expert Strategy' : (isPreview ? 'Generate Expert Strategy' : 'Expert Strategy (Pro - Soon)')}
                                </GlassButton>

                                {isPreview && (
                                    <GlassButton
                                        variant="ghost"
                                        className="flex-[0.3] justify-center border border-dashed border-[var(--text-tertiary)]/30 text-[var(--text-secondary)] hover:bg-[var(--text-secondary)]/5"
                                        onClick={() => router.push(`/app/goals/${goal.id}`)}
                                    >
                                        <Target className="w-4 h-4 mr-2" />
                                        Plan
                                    </GlassButton>
                                )}
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
