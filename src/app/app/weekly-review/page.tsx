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
import { apiClient } from '@/lib/api-client';
import { applyLeverAction } from '@/app/actions/apply-lever';

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
            const data = await apiClient.post<any>('/api/weekly-review/generate', {
                weekStart: format(lastWeekStart, 'yyyy-MM-dd'),
                weekEnd: format(lastWeekEnd, 'yyyy-MM-dd'),
            });

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

        // Update Review Status
        await supabase
            .from('weekly_reviews')
            .update({ user_response: response })
            .eq('id', review.id);

        if (response === 'accepted' && review.lever_action) {
            // Apply the One Lever
            try {
                await applyLeverAction(review.lever_action);
                showToast('✅ Change applied successfully', 'success');
            } catch (err) {
                console.error("Apply Failed", err);
                showToast('Failed to apply change', 'error');
            }
        } else if (response === 'ignored') {
            showToast('Suggestion dismissed', 'info');
        }
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
        <div className="space-y-6 max-w-2xl mx-auto">
            {/* Header */}
            <div className="text-center">
                <h1 className="text-xl font-bold">Weekly Reflection</h1>
                <p className="text-sm text-[var(--color-text-muted)]">
                    {format(lastWeekStart, 'MMM d')} - {format(lastWeekEnd, 'MMM d')}
                </p>
            </div>

            {!review ? (
                <GlassCard padding="lg" className="text-center">
                    <p className="text-sm text-[var(--color-text-muted)] mb-6">
                        Take a moment to close the loop on last week.
                    </p>
                    <GlassButton
                        variant="primary"
                        onClick={generateReview}
                        loading={isGenerating}
                        className="w-full"
                    >
                        Review Last Week
                    </GlassButton>
                    {error && (
                        <p className="text-sm text-red-400 mt-4">{error}</p>
                    )}
                </GlassCard>
            ) : (
                <div className="space-y-6">
                    {/* SECTION 1: REALITY (Neutral Text) */}
                    <section>
                        <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--text-tertiary)] mb-3 text-center">
                            Reality
                        </h2>
                        <GlassCard padding="md">
                            <p className="leading-relaxed text-[var(--color-text-secondary)]">
                                You planned about <span className="font-bold text-[var(--color-text-primary)]">{review.planned_minutes} mins</span>
                                and completed <span className="font-bold text-[var(--color-text-primary)]">{review.actual_minutes} mins</span>.
                                Your energy patterns seem <span className="font-bold text-[var(--color-text-primary)]">{review.energy_trend}</span>.
                            </p>
                        </GlassCard>
                    </section>

                    {/* SECTION 2: PATTERNS (Text Cards) */}
                    {review.friction_patterns.length > 0 && (
                        <section>
                            <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--text-tertiary)] mb-3 text-center">
                                What Stood Out
                            </h2>
                            <div className="space-y-2">
                                {review.friction_patterns.map((pattern, i) => (
                                    <GlassCard key={i} padding="sm" className="border-[var(--glass-border)]">
                                        <div className="flex items-start gap-3">
                                            <span className="text-[var(--color-primary)] mt-0.5">•</span>
                                            <p className="text-sm text-[var(--color-text-secondary)]">{pattern}</p>
                                        </div>
                                    </GlassCard>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* SECTION 3: ONE LEVER (Action) */}
                    <section>
                        <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--text-tertiary)] mb-3 text-center">
                            One Lever
                        </h2>
                        <GlassCard variant="glow" padding="lg" className="border-[var(--color-primary)]/30">
                            <p className="text-lg font-medium text-center mb-6">
                                "{review.suggested_adjustment}"
                            </p>

                            {!review.user_response ? (
                                <div className="space-y-3">
                                    <GlassButton
                                        variant="primary"
                                        size="lg"
                                        onClick={() => handleResponse('accepted')}
                                        className="w-full justify-between group"
                                    >
                                        <span>Apply Change</span>
                                        <Check className="w-5 h-5 opacity-70 group-hover:opacity-100" />
                                    </GlassButton>

                                    <button
                                        onClick={() => handleResponse('ignored')}
                                        className="w-full py-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
                                    >
                                        Ignore
                                    </button>
                                </div>
                            ) : (
                                <div className="text-center py-2">
                                    <p className="text-sm text-[var(--color-text-muted)]">
                                        {review.user_response === 'accepted' ? 'Change applied.' : 'Suggestion ignored.'}
                                    </p>
                                </div>
                            )}
                        </GlassCard>
                    </section>
                </div>
            )}
        </div>
    );
}
