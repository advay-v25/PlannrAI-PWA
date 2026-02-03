'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import {
    Sparkles,
    Tag,
    Lightbulb,
    CheckSquare,
    Loader2,
    ChevronDown,
    ChevronUp,
    Plus,
    X
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
    const [isLoading, setIsLoading] = useState(false);
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

        try {
            const response = await fetch('/api/ai/categorize-dump', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content, dumpId })
            });

            const data = await response.json();

            if (data.error && !data.categories) {
                setError(data.error);
            } else {
                setAnalysis(data);
            }
        } catch (err) {
            setError('Failed to analyze content');
        } finally {
            setIsLoading(false);
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
