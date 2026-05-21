'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import {
    Brain,
    Sparkles,
    Check,
    Calendar,
    Mail,
    Coffee,
    Feather,
    Activity,
    BookOpen,
    Circle,
    ChevronRight,
    Clock,
    X,
    RefreshCw,
    Loader2,
    Zap,
} from 'lucide-react';

interface NextMoveOption {
    id: string;
    type: string;
    label: string;
    description: string;
    duration: number;
    icon: string;
    reasoning?: string;
    priority: 'high' | 'medium' | 'low';
    tradeoff?: string;
}

interface NextMoveGuidance {
    message: string;
    options: NextMoveOption[];
    context: {
        energyLevel: number;
        timeOfDay: string;
        pendingBlocks: number;
        suggestedAction: 'continue' | 'shift' | 'rest';
    };
}

interface NextMoveCardProps {
    onSelect?: (option: NextMoveOption) => void;
    onDismiss?: () => void;
}

const ICON_MAP: Record<string, typeof Brain> = {
    brain: Brain,
    sparkles: Sparkles,
    check: Check,
    calendar: Calendar,
    mail: Mail,
    coffee: Coffee,
    feather: Feather,
    activity: Activity,
    book: BookOpen,
    circle: Circle,
};

function getIcon(iconName: string) {
    return ICON_MAP[iconName] || Circle;
}

/**
 * Next Move Card Component
 * Shows energy-based activity suggestions
 */
export function NextMoveCard({ onSelect, onDismiss }: NextMoveCardProps) {
    const [isLoading, setIsLoading] = useState(true);
    const [guidance, setGuidance] = useState<NextMoveGuidance | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const fetchGuidance = async () => {
        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/next-move');
            const result = await response.json();

            if (result.data?.guidance) {
                setGuidance(result.data.guidance);
            } else {
                setError('Could not get suggestions');
            }
        } catch (err) {
            console.error('Failed to fetch guidance:', err);
            setError('Failed to load suggestions');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchGuidance();
    }, []);

    const handleSelect = async (option: NextMoveOption) => {
        setSelectedId(option.id);

        try {
            await fetch('/api/next-move', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'selected',
                    option_id: option.id,
                    option_type: option.type,
                }),
            });
        } catch (err) {
            console.error('Failed to record action:', err);
        }

        onSelect?.(option);

        // Reset after animation
        setTimeout(() => setSelectedId(null), 1000);
    };

    const handleDismiss = async () => {
        try {
            await fetch('/api/next-move', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'dismissed' }),
            });
        } catch (err) {
            console.error('Failed to record dismiss:', err);
        }

        onDismiss?.();
    };

    if (isLoading) {
        return (
            <GlassCard padding="lg">
                <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary)]" />
                </div>
            </GlassCard>
        );
    }

    if (error || !guidance) {
        return (
            <GlassCard padding="md">
                <div className="text-center py-4">
                    <p className="text-sm text-[var(--text-tertiary)]">{error || 'No suggestions available'}</p>
                    <GlassButton variant="ghost" size="sm" onClick={fetchGuidance} className="mt-2">
                        <RefreshCw className="w-4 h-4" />
                        Retry
                    </GlassButton>
                </div>
            </GlassCard>
        );
    }

    const actionColors = {
        continue: 'var(--color-success)',
        shift: 'var(--color-primary)',
        rest: 'var(--color-warning)',
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
        >
            <GlassCard padding="lg" variant="glow" className="relative overflow-hidden">
                {/* Background glow */}
                <div
                    className="absolute top-0 right-0 w-40 h-40 rounded-full opacity-15 blur-3xl"
                    style={{ backgroundColor: actionColors[guidance.context.suggestedAction] }}
                />

                {/* Header */}
                <div className="relative z-10 flex items-start justify-between mb-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <Sparkles className="w-4 h-4 text-[var(--color-future)]" />
                            <span className="text-overline">What's Next?</span>
                        </div>
                        <p className="text-sm text-[var(--text-secondary)]">
                            {guidance.message}
                        </p>
                    </div>
                    <button
                        onClick={handleDismiss}
                        className="p-1.5 rounded-full hover:bg-[var(--glass-bg)] transition-colors"
                    >
                        <X className="w-4 h-4 text-[var(--text-tertiary)]" />
                    </button>
                </div>

                {/* Context bar */}
                <div className="relative z-10 flex items-center gap-3 mb-4 text-xs text-[var(--text-tertiary)]">
                    <div className="flex items-center gap-1">
                        <Zap className="w-3 h-3" />
                        <span>Energy: {guidance.context.energyLevel}/5</span>
                    </div>
                    <span>•</span>
                    <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{guidance.context.timeOfDay}</span>
                    </div>
                    {guidance.context.pendingBlocks > 0 && (
                        <>
                            <span>•</span>
                            <span>{guidance.context.pendingBlocks} pending</span>
                        </>
                    )}
                </div>

                {/* Options */}
                <div className="relative z-10 space-y-2">
                    <AnimatePresence mode="wait">
                        {guidance.options.map((option, index) => {
                            const Icon = getIcon(option.icon);
                            const isSelected = selectedId === option.id;
                            const priorityColor =
                                option.priority === 'high' ? 'var(--color-success)' :
                                    option.priority === 'medium' ? 'var(--color-primary)' :
                                        'var(--text-tertiary)';

                            return (
                                <motion.button
                                    key={option.id}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{
                                        opacity: 1,
                                        x: 0,
                                        scale: isSelected ? 0.98 : 1,
                                    }}
                                    transition={{ delay: index * 0.1 }}
                                    onClick={() => handleSelect(option)}
                                    className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all ${isSelected
                                            ? 'bg-[var(--color-success)]/20 ring-2 ring-[var(--color-success)]'
                                            : 'bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)]'
                                        }`}
                                    disabled={!!selectedId}
                                >
                                    <div
                                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                                        style={{ backgroundColor: `${priorityColor}20` }}
                                    >
                                        {isSelected ? (
                                            <motion.div
                                                initial={{ scale: 0 }}
                                                animate={{ scale: 1 }}
                                            >
                                                <Check className="w-5 h-5 text-[var(--color-success)]" />
                                            </motion.div>
                                        ) : (
                                            <Icon className="w-5 h-5" style={{ color: priorityColor }} />
                                        )}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="font-medium truncate">{option.label}</p>
                                            <span className="text-xs text-[var(--text-tertiary)]">
                                                {option.duration}min
                                            </span>
                                        </div>
                                        <p className="text-xs text-[var(--text-tertiary)] truncate">
                                            {option.description}
                                        </p>
                                        {option.reasoning && (
                                            <p className="text-xs text-[var(--color-primary)] mt-0.5 truncate">
                                                {option.reasoning}
                                            </p>
                                        )}
                                    </div>

                                    <ChevronRight className="w-5 h-5 text-[var(--text-tertiary)] flex-shrink-0" />
                                </motion.button>
                            );
                        })}
                    </AnimatePresence>
                </div>

                {/* Refresh button */}
                <div className="relative z-10 mt-4 flex justify-center">
                    <button
                        onClick={fetchGuidance}
                        className="flex items-center gap-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--color-primary)] transition-colors"
                    >
                        <RefreshCw className="w-3 h-3" />
                        <span>Different suggestions</span>
                    </button>
                </div>
            </GlassCard>
        </motion.div>
    );
}

/**
 * Compact Next Move Prompt
 * Shows when user might need guidance
 */
interface NextMovePromptProps {
    onExpand?: () => void;
    show?: boolean;
}

export function NextMovePrompt({ onExpand, show = true }: NextMovePromptProps) {
    if (!show) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
        >
            <GlassCard
                interactive
                padding="md"
                className="group cursor-pointer"
                onClick={onExpand}
            >
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--color-future)]/20 flex items-center justify-center">
                        <Sparkles className="w-5 h-5 text-[var(--color-future)]" />
                    </div>
                    <div className="flex-1">
                        <p className="font-medium">Not sure what to do next?</p>
                        <p className="text-xs text-[var(--text-tertiary)]">
                            Get personalized suggestions →
                        </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-[var(--text-tertiary)] group-hover:translate-x-1 transition-transform" />
                </div>
            </GlassCard>
        </motion.div>
    );
}
