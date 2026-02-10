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
            const startStr = format(lastWeekStart, 'yyyy-MM-dd');
            const endStr = format(lastWeekEnd, 'yyyy-MM-dd');

            // 1. Get Context
            const contextRes = await apiClient.get<any>(`/api/weekly-review/context?weekStart=${startStr}&weekEnd=${endStr}`);

            // 2. Call AI Gateway
            // Note: We use 'weekly_review' channel which returns summary (adjustment) and options (lever)
            const aiRes = await apiClient.post<any>('/api/ai/execute', {
                channel: 'weekly_review',
                input: 'Generate Weekly Review',
                context: contextRes,
                limits: { max_options: 1 }
            });
            const aiData = aiRes.data || aiRes;

            if (aiData.summary) {
                // 3. Construct Review Object
                // We default trends/patterns for now as AI schema doesn't strictly support them yet without custom parsing
                const reviewPayload = {
                    week_start: startStr,
                    week_end: endStr,
                    planned_minutes: Math.round(contextRes.plannedMinutes || 0),
                    actual_minutes: Math.round(contextRes.actualMinutes || 0),
                    energy_trend: 'stable', // Placeholder
                    stress_trend: 'stable', // Placeholder
                    friction_patterns: [], // Placeholder
                    suggested_adjustment: aiData.summary,
                    lever_action: aiData.options?.[0] ? {
                        type: 'update_schedule', // Default type, AI needs to be specific in patch
                        payload: aiData.options[0].patch,
                        description: aiData.options[0].title
                    } : null
                };

                // 4. Save Review
                const saveRes = await apiClient.post<any>('/api/weekly-review/save', { review: reviewPayload });

                if (saveRes.review) {
                    setReview(saveRes.review);
                    showToast('✨ Review generated!', 'success');
                } else {
                    throw new Error('Failed to save');
                }
            } else {
                throw new Error('AI failed to generate review');
            }
        } catch (err: any) {
            console.error(err);
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
                        disabled={isGenerating}
                        className="w-full"
                    >
                        {isGenerating ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                Generating...
                            </>
                        ) : (
                            'Review Last Week'
                        )}
                    </GlassButton>
                    {error && (
                        <p className="text-sm text-red-400 mt-4">{error}</p>
                    )}
                </GlassCard>
            ) : (
                <div className="space-y-6">
                    <div className="space-y-10 py-10">
                        {/* SECTION 1: REALITY */}
                        <section className="space-y-4">
                            <div className="flex items-center justify-center gap-3">
                                <div className="h-[1px] w-12 bg-gradient-to-r from-transparent to-white/10" />
                                <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-[var(--text-tertiary)]">Reality</h2>
                                <div className="h-[1px] w-12 bg-gradient-to-l from-transparent to-white/10" />
                            </div>
                            <GlassCard padding="lg" className="border-white/5 shadow-xl text-center">
                                <div className="flex flex-col gap-4">
                                    <p className="text-base text-[var(--text-secondary)] leading-relaxed">
                                        You invested <span className="text-white font-bold">{review.actual_minutes} minutes</span> in your goals this week,
                                        achieving <span className="text-white font-bold">{Math.round((review.actual_minutes / (review.planned_minutes || 1)) * 100)}%</span> of your planned depth.
                                    </p>
                                    <div className="flex items-center justify-center gap-6 pt-2">
                                        <div className="text-center">
                                            <div className="flex items-center justify-center gap-1.5 mb-1">
                                                {getTrendIcon(review.energy_trend)}
                                                <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">Energy</span>
                                            </div>
                                            <p className="text-xs font-bold capitalize">{review.energy_trend}</p>
                                        </div>
                                        <div className="w-[1px] h-8 bg-white/5" />
                                        <div className="text-center">
                                            <div className="flex items-center justify-center gap-1.5 mb-1">
                                                {getTrendIcon(review.stress_trend)}
                                                <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">Stress</span>
                                            </div>
                                            <p className="text-xs font-bold capitalize">{review.stress_trend}</p>
                                        </div>
                                    </div>
                                </div>
                            </GlassCard>
                        </section>

                        {/* SECTION 2: PATTERNS */}
                        {review.friction_patterns.length > 0 && (
                            <section className="space-y-4">
                                <div className="flex items-center justify-center gap-3">
                                    <div className="h-[1px] w-12 bg-gradient-to-r from-transparent to-white/10" />
                                    <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-[var(--text-tertiary)]">Neural Insights</h2>
                                    <div className="h-[1px] w-12 bg-gradient-to-l from-transparent to-white/10" />
                                </div>
                                <div className="grid grid-cols-1 gap-3">
                                    {review.friction_patterns.map((pattern, i) => (
                                        <motion.div
                                            key={i}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: i * 0.1 }}
                                        >
                                            <GlassCard padding="md" className="border-white/5 hover:border-white/10 transition-colors">
                                                <div className="flex items-start gap-4">
                                                    <div className="w-6 h-6 rounded-full bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                                                        <span className="text-[10px] font-bold text-[var(--color-primary)]">{i + 1}</span>
                                                    </div>
                                                    <p className="text-sm font-medium leading-relaxed text-[var(--text-secondary)]">{pattern}</p>
                                                </div>
                                            </GlassCard>
                                        </motion.div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* SECTION 3: THE LEVER */}
                        <section className="space-y-4">
                            <div className="flex items-center justify-center gap-3">
                                <div className="h-[1px] w-12 bg-gradient-to-r from-transparent to-[var(--color-primary)]/20" />
                                <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-[var(--color-primary)]">Strategic Lever</h2>
                                <div className="h-[1px] w-12 bg-gradient-to-l from-transparent to-[var(--color-primary)]/20" />
                            </div>
                            <GlassCard variant="glow" padding="lg" className="border-[var(--color-primary)]/30 shadow-[0_0_50px_var(--color-primary-glow)] relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:scale-110 transition-transform duration-700">
                                    <TrendingUp className="w-32 h-32" />
                                </div>

                                <div className="relative z-10">
                                    <p className="text-xl font-bold tracking-tight text-center mb-8 leading-snug">
                                        "{review.suggested_adjustment}"
                                    </p>

                                    {!review.user_response ? (
                                        <div className="flex flex-col gap-3">
                                            <GlassButton
                                                variant="primary"
                                                size="lg"
                                                onClick={() => handleResponse('accepted')}
                                                className="w-full justify-between h-14 group/btn"
                                            >
                                                <span className="font-bold tracking-wide">Sync Protocol</span>
                                                <Check className="w-5 h-5 group-hover/btn:scale-110 transition-transform" />
                                            </GlassButton>

                                            <button
                                                onClick={() => handleResponse('ignored')}
                                                className="w-full py-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)] text-center hover:text-[var(--text-secondary)] transition-colors"
                                            >
                                                Dismiss Suggestion
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="text-center py-4 bg-white/5 rounded-2xl border border-white/5">
                                            <p className="text-xs font-bold uppercase tracking-widest text-[var(--color-primary)]">
                                                {review.user_response === 'accepted' ? 'Protocol Synchronized' : 'Suggestion Archived'}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </GlassCard>
                        </section>
                    </div>
                </div>
            )}
        </div>
    );
}
