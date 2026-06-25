'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { apiClient } from '@/lib/api-client';
import {
    AlertTriangle,
    Calendar,
    Battery,
    HelpCircle,
    Shield,
    Lightbulb,
    ChevronRight,
    X,
    Check,
    Loader2,
} from 'lucide-react';

export type DeviationType = 'unavoidable' | 'structural' | 'energy' | 'skill' | 'avoidance';

interface DeviationClassification {
    type: DeviationType;
    confidence: number;
    explanation: string;
    suggestions: string[];
    rootCause?: string;
    patternMatch?: string;
}

interface DeviationClassifierProps {
    blockId: string;
    blockTitle: string;
    onClassified?: (classification: DeviationClassification) => void;
    onClose?: () => void;
}

const DEVIATION_INFO: Record<DeviationType, {
    icon: typeof AlertTriangle;
    label: string;
    color: string;
    description: string;
}> = {
    unavoidable: {
        icon: Shield,
        label: 'Unavoidable',
        color: 'var(--text-tertiary)',
        description: 'External factors (emergency, illness)',
    },
    structural: {
        icon: Calendar,
        label: 'Structural',
        color: 'var(--color-primary)',
        description: 'Schedule or environment issues',
    },
    energy: {
        icon: Battery,
        label: 'Energy',
        color: 'var(--color-warning)',
        description: 'Fatigue, burnout, low energy',
    },
    skill: {
        icon: HelpCircle,
        label: 'Skill Gap',
        color: 'var(--color-body)',
        description: 'Task unclear or too complex',
    },
    avoidance: {
        icon: AlertTriangle,
        label: 'Avoidance',
        color: 'var(--color-error)',
        description: 'Procrastination, fear, resistance',
    },
};

/**
 * Deviation Classifier Component
 * Helps users understand why they didn't complete a block
 */
export function DeviationClassifier({
    blockId,
    blockTitle,
    onClassified,
    onClose
}: DeviationClassifierProps) {
    const [step, setStep] = useState<'reason' | 'manual' | 'result'>('reason');
    const [reason, setReason] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [classification, setClassification] = useState<DeviationClassification | null>(null);
    const [manualType, setManualType] = useState<DeviationType | null>(null);

    const handleAnalyze = async () => {
        if (!reason.trim()) return;

        setIsProcessing(true);

        try {
            const result = await apiClient.post<any>('/api/deviation', {
                block_id: blockId,
                reason: reason.trim(),
                use_ai: true,
            });

            if (result.classification) {
                setClassification(result.classification);
                setStep('result');
                onClassified?.(result.classification);
            } else {
                // Fallback to manual selection
                setStep('manual');
            }
        } catch (error) {
            console.error('Classification failed:', error);
            setStep('manual');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleManualSelect = async (type: DeviationType) => {
        setManualType(type);
        setIsProcessing(true);

        try {
            const result = await apiClient.post<any>('/api/deviation', {
                block_id: blockId,
                reason: 'Auto-resolved via UI',
                use_ai: false,
                override_classification: type
            });

            if (result.classification) {
                setClassification(result.classification);
                setStep('result');
                onClassified?.(result.classification);
            }
        } catch (error) {
            console.error('Failed to log deviation:', error);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={(e) => e.target === e.currentTarget && onClose?.()}
        >
            <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="w-full max-w-md"
            >
                <GlassCard padding="lg" className="relative">
                    {/* Close button */}
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-2 rounded-full hover:bg-[var(--glass-bg)] transition-colors"
                    >
                        <X className="w-5 h-5 text-[var(--text-tertiary)]" />
                    </button>

                    {/* Header */}
                    <div className="mb-6">
                        <h2 className="text-heading">What happened?</h2>
                        <p className="text-caption mt-1 pr-8">
                            Understanding why helps us improve your system
                        </p>
                        <p className="text-sm font-medium text-[var(--text-secondary)] mt-2">
                            {blockTitle}
                        </p>
                    </div>

                    <AnimatePresence mode="wait">
                        {/* Step 1: Enter reason */}
                        {step === 'reason' && (
                            <motion.div
                                key="reason"
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                className="space-y-4"
                            >
                                <div>
                                    <textarea
                                        value={reason}
                                        onChange={(e) => setReason(e.target.value)}
                                        placeholder="What got in the way? (e.g., 'felt too tired', 'got interrupted by a call', 'didn't know where to start')"
                                        className="w-full p-4 bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl text-sm resize-none focus:outline-none focus:border-[var(--color-primary)] min-h-[120px]"
                                        autoFocus
                                    />
                                </div>

                                <div className="flex gap-3">
                                    <GlassButton
                                        variant="ghost"
                                        className="flex-1"
                                        onClick={() => setStep('manual')}
                                    >
                                        Skip to quick pick
                                    </GlassButton>
                                    <GlassButton
                                        variant="primary"
                                        className="flex-1"
                                        onClick={handleAnalyze}
                                        disabled={!reason.trim()}
                                        loading={isProcessing}
                                    >
                                        <Lightbulb className="w-4 h-4" />
                                        Analyze
                                    </GlassButton>
                                </div>
                            </motion.div>
                        )}

                        {/* Step 2: Manual type selection */}
                        {step === 'manual' && (
                            <motion.div
                                key="manual"
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                className="space-y-3"
                            >
                                <p className="text-sm text-[var(--text-secondary)] mb-4">
                                    Pick what best describes why this didn&apos;t happen:
                                </p>

                                {(Object.entries(DEVIATION_INFO) as [DeviationType, typeof DEVIATION_INFO[DeviationType]][]).map(([type, info]) => {
                                    const Icon = info.icon;
                                    const isSelected = manualType === type;

                                    return (
                                        <motion.button
                                            key={type}
                                            onClick={() => handleManualSelect(type)}
                                            disabled={isProcessing}
                                            className={`w-full flex items-center gap-3 p-4 rounded-xl text-left transition-all ${isSelected
                                                    ? 'ring-2 ring-[var(--color-primary)] bg-[var(--color-primary)]/10'
                                                    : 'bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)]'
                                                }`}
                                            whileHover={{ scale: 1.01 }}
                                            whileTap={{ scale: 0.99 }}
                                        >
                                            <div
                                                className="w-10 h-10 rounded-xl flex items-center justify-center"
                                                style={{ backgroundColor: `${info.color}20` }}
                                            >
                                                <Icon className="w-5 h-5" style={{ color: info.color }} />
                                            </div>
                                            <div className="flex-1">
                                                <p className="font-medium">{info.label}</p>
                                                <p className="text-xs text-[var(--text-tertiary)]">
                                                    {info.description}
                                                </p>
                                            </div>
                                            {isProcessing && isSelected ? (
                                                <Loader2 className="w-5 h-5 animate-spin text-[var(--color-primary)]" />
                                            ) : (
                                                <ChevronRight className="w-5 h-5 text-[var(--text-tertiary)]" />
                                            )}
                                        </motion.button>
                                    );
                                })}

                                <button
                                    onClick={() => setStep('reason')}
                                    className="text-sm text-[var(--text-tertiary)] mt-2 hover:text-[var(--text-secondary)]"
                                >
                                    ← Back to description
                                </button>
                            </motion.div>
                        )}

                        {/* Step 3: Show result */}
                        {step === 'result' && classification && (
                            <motion.div
                                key="result"
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                className="space-y-5"
                            >
                                {/* Classification result */}
                                <div className="flex items-center gap-4 p-4 rounded-xl bg-[var(--glass-bg)]">
                                    {(() => {
                                        const info = DEVIATION_INFO[classification.type];
                                        const Icon = info.icon;
                                        return (
                                            <>
                                                <div
                                                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                                                    style={{ backgroundColor: `${info.color}20` }}
                                                >
                                                    <Icon className="w-6 h-6" style={{ color: info.color }} />
                                                </div>
                                                <div>
                                                    <p className="font-semibold">{info.label}</p>
                                                    <p className="text-xs text-[var(--text-tertiary)]">
                                                        {Math.round(classification.confidence * 100)}% confidence
                                                    </p>
                                                </div>
                                            </>
                                        );
                                    })()}
                                </div>

                                {/* Explanation */}
                                <div className="p-4 rounded-xl bg-[var(--glass-bg)]">
                                    <p className="text-sm text-[var(--text-secondary)]">
                                        {classification.explanation}
                                    </p>
                                </div>

                                {/* Suggestions */}
                                {classification.suggestions.length > 0 && (
                                    <div className="space-y-2">
                                        <p className="text-overline">Suggestions</p>
                                        {classification.suggestions.map((suggestion, i) => (
                                            <div
                                                key={i}
                                                className="flex items-start gap-2 p-3 rounded-lg bg-[var(--glass-bg)]"
                                            >
                                                <Lightbulb className="w-4 h-4 text-[var(--color-future)] mt-0.5" />
                                                <p className="text-sm">{suggestion}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Pattern match */}
                                {classification.patternMatch && (
                                    <div className="flex items-center gap-2 p-3 rounded-lg border border-dashed border-[var(--glass-border)]">
                                        <AlertTriangle className="w-4 h-4 text-[var(--color-warning)]" />
                                        <p className="text-sm text-[var(--text-secondary)]">
                                            Pattern detected: <strong>{classification.patternMatch}</strong>
                                        </p>
                                    </div>
                                )}

                                <GlassButton
                                    variant="primary"
                                    className="w-full"
                                    onClick={onClose}
                                >
                                    <Check className="w-4 h-4" />
                                    Got it
                                </GlassButton>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </GlassCard>
            </motion.div>
        </motion.div>
    );
}

/**
 * Deviation Summary Component
 * Shows deviation patterns over time
 */
interface DeviationPattern {
    byType: Record<DeviationType, number>;
    total: number;
    mostCommon: string;
}

interface DeviationSummaryProps {
    patterns: DeviationPattern;
}

export function DeviationSummary({ patterns }: DeviationSummaryProps) {
    if (patterns.total === 0) return null;

    return (
        <GlassCard padding="md">
            <h4 className="text-subheading mb-3">Deviation Patterns</h4>

            <div className="space-y-2">
                {(Object.entries(patterns.byType) as [DeviationType, number][])
                    .filter(([, count]) => count > 0)
                    .sort(([, a], [, b]) => b - a)
                    .map(([type, count]) => {
                        const info = DEVIATION_INFO[type];
                        const Icon = info.icon;
                        const percentage = Math.round((count / patterns.total) * 100);

                        return (
                            <div key={type} className="flex items-center gap-3">
                                <Icon className="w-4 h-4" style={{ color: info.color }} />
                                <div className="flex-1">
                                    <div className="flex justify-between text-sm mb-1">
                                        <span>{info.label}</span>
                                        <span className="text-[var(--text-tertiary)]">{count}</span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-[var(--glass-bg)] overflow-hidden">
                                        <motion.div
                                            className="h-full rounded-full"
                                            style={{ backgroundColor: info.color }}
                                            initial={{ width: 0 }}
                                            animate={{ width: `${percentage}%` }}
                                            transition={{ duration: 0.5, ease: 'easeOut' }}
                                        />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
            </div>

            {patterns.mostCommon && (
                <p className="text-xs text-[var(--text-tertiary)] mt-4">
                    Most common: <strong>{DEVIATION_INFO[patterns.mostCommon as DeviationType]?.label}</strong>
                </p>
            )}
        </GlassCard>
    );
}
