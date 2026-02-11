'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { apiClient } from '@/lib/api-client';
import {
    Sparkles,
    Tag,
    Lightbulb,
    CheckSquare,
    Loader2,
    ChevronDown,
    ChevronUp,
    Plus,
} from 'lucide-react';

interface ExtractedTask {
    title: string;
    priority: 'high' | 'medium' | 'low';
    category: string;
}

interface BrainDumpAnalysis {
    categories: string[];
    extractedTasks: ExtractedTask[];
    themes: string[];
    sentiment: string;
    keyInsight: string;
}

interface BrainDumpAnalyzerProps {
    content: string;
    dumpId?: string;
    onTaskAccept?: (task: ExtractedTask) => void;
    className?: string;
}

const CATEGORY_COLORS: Record<string, string> = {
    work: 'var(--color-future)',
    personal: 'var(--color-primary)',
    health: 'var(--color-body)',
    relationships: 'var(--color-warning)',
    finances: 'var(--color-success)',
    creativity: 'var(--color-mind)',
    stress: 'var(--color-danger)',
    planning: 'var(--color-muted)',
    reflection: 'var(--color-accent-mind)',
    general: 'var(--color-text-muted)'
};

const SENTIMENT_EMOJI: Record<string, string> = {
    positive: '😊',
    neutral: '😌',
    stressed: '😓',
    anxious: '😰',
    hopeful: '🌟',
    frustrated: '😤'
};

const PRIORITY_COLORS: Record<string, string> = {
    high: 'var(--color-danger)',
    medium: 'var(--color-warning)',
    low: 'var(--color-success)'
};

export function BrainDumpAnalyzer({
    content,
    dumpId,
    onTaskAccept,
    className = ''
}: BrainDumpAnalyzerProps) {
    const [analysis, setAnalysis] = useState<BrainDumpAnalysis | null>(null);
    const [aiOptions, setAiOptions] = useState<any[]>([]); // Store actionable options
    const [isLoading, setIsLoading] = useState(false);
    const [isApplying, setIsApplying] = useState<string | null>(null); // Track applying state by option ID
    const [error, setError] = useState('');
    const [showTasks, setShowTasks] = useState(true);
    const [acceptedTasks, setAcceptedTasks] = useState<Set<string>>(new Set());
    const [hasAutoAnalyzed, setHasAutoAnalyzed] = useState(false);

    // Auto-analyze on mount if content is sufficient
    useEffect(() => {
        if (content.trim().length >= 20 && !hasAutoAnalyzed && !analysis && !isLoading) {
            setHasAutoAnalyzed(true);
            analyzeContentInternal();
        }
    }, [content, hasAutoAnalyzed, analysis, isLoading]);

    const analyzeContentInternal = async () => {
        if (!content.trim() || content.length < 20) {
            setError('Content too short to analyze');
            return;
        }

        setIsLoading(true);
        setError('');
        setAiOptions([]);

        try {
            const aiData = await apiClient.ai.execute({
                channel: 'brain_dump',
                input: content,
                context: { dumpId }
            });

            if (aiData.options && aiData.options.length > 0) {
                // 1. Extract Analysis from first option (all options have it)
                const firstOption = aiData.options[0];
                const analysisOp = firstOption.patch?.ops.find((op: any) => op.op === 'analyze_content');

                if (analysisOp && 'analysis' in analysisOp) {
                    setAnalysis(analysisOp.analysis as BrainDumpAnalysis);
                } else {
                    setError('Analysis format invalid');
                }

                // 2. Filter Actionable Options (those doing more than just analysis)
                // Or show all, allowing user to pick "Just Log" explicitly
                setAiOptions(aiData.options);

            } else if (aiData.refusal) {
                setError(aiData.refusal.reason || 'AI refused to analyze');
            } else {
                if (aiData.summary) {
                    setError('AI analysis incomplete');
                }
            }
        } catch (err: any) {
            console.error('Analysis error:', err);
            setError(err.message || 'Failed to analyze content');
        } finally {
            setIsLoading(false);
        }
    };

    const handleApplyOption = async (option: any) => {
        setIsApplying(option.id || 'unknown');
        try {
            await apiClient.patch.apply(option.patch, 'brain_dump_action');
            // Show success, maybe remove options?
            setAiOptions([]); // Clear options after apply to prevent double apply
            // Maybe show a toast or status?
        } catch (err) {
            console.error("Apply failed", err);
            setError("Failed to apply changes");
        } finally {
            setIsApplying(null);
        }
    };

    const handleAcceptTask = (task: ExtractedTask) => {
        setAcceptedTasks(prev => new Set(prev).add(task.title));
        onTaskAccept?.(task);
    };

    if (!content.trim()) return null;

    return (
        <div className={className}>
            {/* Auto-analysis happens on mount, no manual button needed */}

            {isLoading && (
                <div className="flex items-center justify-center gap-2 py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-[var(--color-primary)]" />
                    <span className="text-sm text-[var(--color-text-muted)]">Analyzing...</span>
                </div>
            )}

            {error && (
                <p className="text-sm text-red-400 text-center py-2">{error}</p>
            )}

            <AnimatePresence>
                {analysis && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-4"
                    >
                        {/* Key Insight */}
                        {analysis.keyInsight && (
                            <GlassCard padding="sm" variant="glow">
                                <div className="flex items-start gap-2">
                                    <Lightbulb className="w-4 h-4 text-[var(--color-warning)] flex-shrink-0 mt-0.5" />
                                    <p className="text-sm">{analysis.keyInsight}</p>
                                </div>
                            </GlassCard>
                        )}

                        {/* Categories & Sentiment Row */}
                        <div className="flex flex-wrap items-center gap-2">
                            {/* Sentiment */}
                            <span className="text-lg" title={`Mood: ${analysis.sentiment}`}>
                                {SENTIMENT_EMOJI[analysis.sentiment] || '😌'}
                            </span>

                            {/* Categories */}
                            {analysis.categories.map((cat) => (
                                <span
                                    key={cat}
                                    className="px-2 py-1 rounded-full text-xs font-medium"
                                    style={{
                                        backgroundColor: `${CATEGORY_COLORS[cat] || CATEGORY_COLORS.general}20`,
                                        color: CATEGORY_COLORS[cat] || CATEGORY_COLORS.general
                                    }}
                                >
                                    {cat}
                                </span>
                            ))}
                        </div>

                        {/* Themes */}
                        {analysis.themes.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                <Tag className="w-4 h-4 text-[var(--color-text-muted)]" />
                                {analysis.themes.map((theme, i) => (
                                    <span
                                        key={i}
                                        className="text-xs text-[var(--color-text-secondary)] bg-[var(--glass-bg)] px-2 py-1 rounded"
                                    >
                                        {theme}
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* Extracted Tasks */}
                        {analysis.extractedTasks.length > 0 && (
                            <div>
                                <button
                                    onClick={() => setShowTasks(!showTasks)}
                                    className="flex items-center gap-2 text-sm font-medium text-[var(--color-text-secondary)] mb-2"
                                >
                                    <CheckSquare className="w-4 h-4" />
                                    Extracted Tasks ({analysis.extractedTasks.length})
                                    {showTasks ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                </button>

                                <AnimatePresence>
                                    {showTasks && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="space-y-2"
                                        >
                                            {analysis.extractedTasks.map((task, i) => {
                                                const isAccepted = acceptedTasks.has(task.title);
                                                return (
                                                    <motion.div
                                                        key={i}
                                                        initial={{ opacity: 0, x: -10 }}
                                                        animate={{ opacity: 1, x: 0 }}
                                                        transition={{ delay: i * 0.05 }}
                                                        className={`flex items-center gap-2 p-2 rounded-lg bg-[var(--glass-bg)] ${isAccepted ? 'opacity-50' : ''}`}
                                                    >
                                                        <div
                                                            className="w-2 h-2 rounded-full flex-shrink-0"
                                                            style={{ backgroundColor: PRIORITY_COLORS[task.priority] }}
                                                            title={`${task.priority} priority`}
                                                        />
                                                        <span className="text-sm flex-1 truncate">{task.title}</span>
                                                        {!isAccepted && onTaskAccept && (
                                                            <button
                                                                onClick={() => handleAcceptTask(task)}
                                                                className="p-1 rounded hover:bg-[var(--glass-bg-active)] text-[var(--color-success)]"
                                                                title="Add as goal"
                                                            >
                                                                <Plus className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                        {isAccepted && (
                                                            <span className="text-xs text-[var(--color-success)]">Added</span>
                                                        )}
                                                    </motion.div>
                                                );
                                            })}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}

                        {/* Recommended Actions */}
                        {aiOptions.length > 0 && (
                            <div className="py-4 border-t border-[var(--glass-border)] space-y-3">
                                <h4 className="text-sm font-medium text-[var(--color-text-secondary)] flex items-center gap-2">
                                    <Sparkles className="w-4 h-4 text-[var(--color-primary)]" />
                                    Recommended Actions
                                </h4>
                                <div className="space-y-2">
                                    {aiOptions.map((opt, i) => (
                                        <GlassButton
                                            key={opt.id || i}
                                            variant="default"
                                            className="w-full text-left justify-start group"
                                            onClick={() => handleApplyOption(opt)}
                                            disabled={!!isApplying}
                                        >
                                            <div className="flex items-center gap-3 w-full">
                                                <div className="flex-1">
                                                    <div className="font-medium text-sm text-[var(--color-text-primary)]">
                                                        {opt.title || "Apply Adjustments"}
                                                    </div>
                                                    <div className="text-xs text-[var(--color-text-secondary)] opacity-80">
                                                        {opt.impact || "Update schedule based on analysis"}
                                                    </div>
                                                </div>
                                                {isApplying === (opt.id || 'unknown') ? (
                                                    <Loader2 className="w-4 h-4 animate-spin text-[var(--color-primary)]" />
                                                ) : (
                                                    <div className="text-[10px] px-2 py-1 rounded bg-[var(--color-primary)]/10 text-[var(--color-primary)] border border-[var(--color-primary)]/20 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        Apply
                                                    </div>
                                                )}
                                            </div>
                                        </GlassButton>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Re-analyze button */}
                        <GlassButton
                            variant="ghost"
                            size="sm"
                            onClick={analyzeContentInternal}
                            className="w-full"
                        >
                            <Sparkles className="w-4 h-4" />
                            Re-analyze
                        </GlassButton>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
