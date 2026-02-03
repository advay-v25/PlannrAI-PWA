'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '@/components/ui/glass-card';
import { Sparkles, RefreshCw, X, ChevronRight, Loader2 } from 'lucide-react';

interface DailyInsight {
    greeting: string;
    insight: string;
    focusSuggestion: string;
    encouragement: string;
}

interface AIInsightCardProps {
    onDismiss?: () => void;
    className?: string;
}

export function AIInsightCard({ onDismiss, className = '' }: AIInsightCardProps) {
    const [insight, setInsight] = useState<DailyInsight | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [dismissed, setDismissed] = useState(false);

    const fetchInsight = async () => {
        setLoading(true);
        setError('');

        try {
            const response = await fetch('/api/ai/daily-insight');
            const data = await response.json();

            if (!response.ok) {
                if (response.status === 401) {
                    setError('Sign in for AI insights');
                } else {
                    setError(data.error || 'Failed to load insight');
                }
                return;
            }

            if (data.success && data.data?.insight) {
                setInsight(data.data.insight);
            } else {
                setError('No insight available');
            }
        } catch {
            setError('Connection error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchInsight();
    }, []);

    const handleDismiss = () => {
        setDismissed(true);
        onDismiss?.();
    };

    if (dismissed) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className={className}
            >
                <GlassCard className="relative overflow-hidden">
                    {/* AI Glow Effect */}
                    <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-purple-500/10 pointer-events-none" />

                    {/* Header */}
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-purple-500 flex items-center justify-center">
                                <Sparkles className="w-4 h-4 text-white" />
                            </div>
                            <span className="text-sm font-medium text-[var(--text-secondary)]">
                                AI Insight
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={fetchInsight}
                                disabled={loading}
                                className="p-1.5 rounded-lg hover:bg-[var(--glass-bg-hover)] transition-colors disabled:opacity-50"
                                title="Refresh insight"
                            >
                                <RefreshCw className={`w-4 h-4 text-[var(--text-tertiary)] ${loading ? 'animate-spin' : ''}`} />
                            </button>
                            <button
                                onClick={handleDismiss}
                                className="p-1.5 rounded-lg hover:bg-[var(--glass-bg-hover)] transition-colors"
                                title="Dismiss"
                            >
                                <X className="w-4 h-4 text-[var(--text-tertiary)]" />
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
                            <span className="ml-2 text-sm text-[var(--text-secondary)]">Analyzing your day...</span>
                        </div>
                    ) : error ? (
                        <div className="text-center py-4">
                            <p className="text-sm text-[var(--text-tertiary)]">{error}</p>
                        </div>
                    ) : insight ? (
                        <div className="space-y-3">
                            {/* Greeting */}
                            <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                                {insight.greeting}
                            </h3>

                            {/* Insight */}
                            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                                {insight.insight}
                            </p>

                            {/* Focus Suggestion */}
                            <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--glass-bg)]">
                                <ChevronRight className="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0" />
                                <p className="text-sm text-[var(--text-primary)]">
                                    {insight.focusSuggestion}
                                </p>
                            </div>

                            {/* Encouragement */}
                            <p className="text-sm text-cyan-400 font-medium">
                                {insight.encouragement}
                            </p>
                        </div>
                    ) : null}
                </GlassCard>
            </motion.div>
        </AnimatePresence>
    );
}

export default AIInsightCard;
