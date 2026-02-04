'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toast';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import {
    LineChart as LineChartIcon,
    TrendingUp,
    TrendingDown,
    Minus,
    Check,
    Edit2,
    X,
    Loader2,
    AlertCircle
} from 'lucide-react';
import { format, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import type { WeeklyReview, ReviewResponse } from '@/types/database';

export default function WeeklyReviewPage() {
    const supabase = createClient();
    const { showToast } = useToast();
    const [review, setReview] = useState<WeeklyReview | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState('');

    const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const lastWeekStart = subWeeks(currentWeekStart, 1);
    const lastWeekEnd = endOfWeek(lastWeekStart, { weekStartsOn: 1 });

    useEffect(() => {
        loadReview();
    }, []);

    const loadReview = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const weekStartStr = format(lastWeekStart, 'yyyy-MM-dd');

        const { data } = await supabase
            .from('weekly_reviews')
            .select('*')
            .eq('user_id', user.id)
            .eq('week_start', weekStartStr)
            .single();

        setReview(data);
        setIsLoading(false);
    };

    const generateReview = async () => {
        setIsGenerating(true);
        setError('');

        try {
            const response = await fetch('/api/weekly-review/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    weekStart: format(lastWeekStart, 'yyyy-MM-dd'),
                    weekEnd: format(lastWeekEnd, 'yyyy-MM-dd'),
                }),
            });

            const data = await response.json();
            if (data.review) {
                setReview(data.review);
                showToast('✨ Review generated!', 'success');
            } else {
                setError('Failed to generate review');
                showToast('Failed to generate review', 'error');
            }
        } catch (err) {
            setError('Failed to generate review');
            showToast('Failed to generate review', 'error');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleResponse = async (response: ReviewResponse) => {
        if (!review) return;

        setReview({ ...review, user_response: response });

        await supabase
            .from('weekly_reviews')
            .update({ user_response: response })
            .eq('id', review.id);

        const responseLabels = {
            accepted: '✅ Suggestion accepted',
            edited: '✏️ Marked for editing',
            ignored: '⏭️ Skipped'
        };
        showToast(responseLabels[response], 'info');
    };

    const getTrendIcon = (trend: string) => {
        if (trend === 'improving') return <TrendingUp className="w-4 h-4 text-[var(--color-success)]" />;
        if (trend === 'declining' || trend === 'increasing') return <TrendingDown className="w-4 h-4 text-[var(--color-warning)]" />;
        return <Minus className="w-4 h-4 text-[var(--color-text-muted)]" />;
    };

    const progressPercent = review
        ? Math.min(100, Math.round((review.actual_minutes / Math.max(review.planned_minutes, 1)) * 100))
        : 0;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold">Weekly Review</h1>
                <p className="text-sm text-[var(--color-text-muted)]">
                    {format(lastWeekStart, 'MMM d')} - {format(lastWeekEnd, 'MMM d, yyyy')}
                </p>
            </div>

            {!review ? (
                <GlassCard padding="lg" className="text-center">
                    <LineChartIcon className="w-12 h-12 mx-auto mb-4 text-[var(--color-text-muted)]" />
                    <h3 className="font-medium mb-2">No review for last week</h3>
                    <p className="text-sm text-[var(--color-text-muted)] mb-4">
                        Generate a review to see your patterns and get suggestions
                    </p>
                    <GlassButton
                        variant="primary"
                        onClick={generateReview}
                        loading={isGenerating}
                    >
                        Generate Review
                    </GlassButton>
                    {error && (
                        <p className="text-sm text-red-400 mt-4">{error}</p>
                    )}
                </GlassCard>
            ) : (
                <>
                    {/* Time Overview */}
                    <GlassCard variant="glow" padding="md">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="font-medium">Time Investment</h2>
                            <span className="text-2xl font-bold text-[var(--color-primary)]">{progressPercent}%</span>
                        </div>

                        {/* Progress Bar */}
                        <div className="h-3 rounded-full bg-[var(--glass-bg)] overflow-hidden mb-3">
                            <motion.div
                                className="h-full rounded-full bg-[var(--color-primary)]"
                                initial={{ width: 0 }}
                                animate={{ width: `${progressPercent}%` }}
                                transition={{ duration: 1, ease: 'easeOut' }}
                            />
                        </div>

                        <div className="flex justify-between text-sm text-[var(--color-text-muted)]">
                            <span>{review.actual_minutes} min completed</span>
                            <span>{review.planned_minutes} min planned</span>
                        </div>
                    </GlassCard>

                    {/* Trends */}
                    <div className="grid grid-cols-2 gap-3">
                        <GlassCard padding="md">
                            <div className="flex items-center gap-2 mb-1">
                                {getTrendIcon(review.energy_trend)}
                                <span className="text-sm font-medium">Energy</span>
                            </div>
                            <p className="text-lg font-bold capitalize">{review.energy_trend}</p>
                        </GlassCard>

                        <GlassCard padding="md">
                            <div className="flex items-center gap-2 mb-1">
                                {getTrendIcon(review.stress_trend)}
                                <span className="text-sm font-medium">Stress</span>
                            </div>
                            <p className="text-lg font-bold capitalize">{review.stress_trend}</p>
                        </GlassCard>
                    </div>

                    {/* Friction Patterns */}
                    {review.friction_patterns.length > 0 && (
                        <GlassCard padding="md">
                            <h3 className="font-medium mb-3">What Got In The Way</h3>
                            <div className="space-y-2">
                                {review.friction_patterns.map((pattern, i) => (
                                    <div key={i} className="flex items-start gap-2">
                                        <AlertCircle className="w-4 h-4 text-[var(--color-warning)] mt-0.5 flex-shrink-0" />
                                        <p className="text-sm text-[var(--color-text-secondary)]">{pattern}</p>
                                    </div>
                                ))}
                            </div>
                        </GlassCard>
                    )}

                    {/* Suggested Adjustment */}
                    <GlassCard variant="glow" padding="md">
                        <h3 className="font-medium mb-2">Suggested Adjustment</h3>
                        <p className="text-sm text-[var(--color-text-secondary)] mb-4">
                            {review.suggested_adjustment}
                        </p>

                        {!review.user_response ? (
                            <div className="flex gap-2">
                                <GlassButton
                                    variant="primary"
                                    size="sm"
                                    onClick={() => handleResponse('accepted')}
                                    className="flex-1"
                                >
                                    <Check className="w-4 h-4" />
                                    Accept
                                </GlassButton>
                                <GlassButton
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleResponse('edited')}
                                    className="flex-1"
                                >
                                    <Edit2 className="w-4 h-4" />
                                    Edit
                                </GlassButton>
                                <GlassButton
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleResponse('ignored')}
                                    className="flex-1"
                                >
                                    <X className="w-4 h-4" />
                                    Skip
                                </GlassButton>
                            </div>
                        ) : (
                            <p className="text-sm text-[var(--color-text-muted)]">
                                You {review.user_response === 'accepted' ? 'accepted' : review.user_response === 'edited' ? 'edited' : 'skipped'} this suggestion
                            </p>
                        )}
                    </GlassCard>

                    {/* Reassurance */}
                    <p className="text-center text-xs text-[var(--color-text-muted)]">
                        Every choice is valid. Skipping is not failure.
                    </p>
                </>
            )}
        </div>
    );
}
