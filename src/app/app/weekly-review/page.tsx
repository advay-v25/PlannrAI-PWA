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
import { apiClient } from '@/lib/api-client';
import { applyLeverAction } from '@/app/actions/apply-lever';
import { PatchPreviewModal } from '@/components/calendar/patch-preview-modal';

type ReviewResponse = 'accepted' | 'ignored';

interface WeeklyReview {
    id: string;
    user_id: string;
    week_start: string;
    week_end: string;
    planned_minutes: number;
    actual_minutes: number;
    energy_trend: string;
    stress_trend: string;
    friction_patterns: any[];
    suggested_adjustment: string;
    lever_action: { type: 'update_schedule' | 'update_goal' | 'update_preference'; payload: any; description?: string } | null;
    user_response?: ReviewResponse;
    lever_note?: string;
    raw_patterns?: any[];
}

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

    const [previewData, setPreviewData] = useState<any>(null);
    const [showPreview, setShowPreview] = useState(false);
    const [isApplying, setIsApplying] = useState(false);

    const generateReview = async () => {
        setIsGenerating(true);
        setError('');

        try {
            const startStr = format(lastWeekStart, 'yyyy-MM-dd');
            const endStr = format(lastWeekEnd, 'yyyy-MM-dd');

            // 1. Get Context
            const contextRes = await apiClient.get<any>(`/api/weekly-review/context?weekStart=${startStr}&weekEnd=${endStr}`);

            // 2. Call AI Gateway
            const aiRes = await apiClient.post<any>('/api/ai/execute', {
                channel: 'weekly_review',
                input: 'Generate Weekly Review',
                context: contextRes,
                limits: { max_options: 1 }
            });
            const aiData = aiRes.data || aiRes;

            if (aiData.reality) {
                // 3. Construct Review Object
                const reviewPayload = {
                    week_start: startStr,
                    week_end: endStr,
                    planned_minutes: Math.round(contextRes.plannedMinutes || 0),
                    actual_minutes: Math.round(contextRes.actualMinutes || 0),
                    energy_trend: 'stable',
                    stress_trend: 'stable',
                    friction_patterns: (aiData.patterns || []), // distinct patterns
                    suggested_adjustment: aiData.reality,
                    // The AI returns 'lever' with a patch.
                    lever_action: aiData.lever ? {
                        type: 'update_schedule', // This is a simplification, patch acts on everything
                        payload: aiData.lever.patch,
                        description: aiData.lever.label
                    } : null,
                    lever_note: aiData.note || '',
                    raw_patterns: aiData.patterns || []
                };

                // 4. Save Review
                const saveRes = await apiClient.post<any>('/api/weekly-review/save', { review: reviewPayload });

                if (saveRes.review) {
                    setReview(saveRes.review);
                    showToast('✨ Review generated!', 'success');
                } else {
                    throw new Error('Failed to saveto DB');
                }
            } else {
                throw new Error('AI failed to generate review structure');
            }
        } catch (err: any) {
            console.error(err);
            setError('Failed to generate review. Please try again.');
            showToast('Failed to generate review', 'error');
        } finally {
            setIsGenerating(false);
        }
    };

    const handlePreviewLever = () => {
        if (!review?.lever_action?.payload) return;

        // Construct preview data for modal
        // Simplification: We might need to generate a real diff. 
        // For now, let's create a synthetic one or try to use the patch.
        // Similar to DayOptimizer, we need 'diff' and 'warnings'.

        const patch = review.lever_action.payload;
        const diff = {
            created: [],
            moved: [],
            deleted: []
        };
        const warnings: string[] = [];

        // Simple patch parsing for preview
        if (patch.ops) {
            patch.ops.forEach((op: any) => {
                if (op.op === 'create_block') {
                    (diff.created as any[]).push({
                        title: op.payload.title || "New Block",
                        start_time: op.payload.start_time,
                        date: op.payload.date
                    });
                } else if (op.op === 'update_goal') {
                    (diff.moved as any[]).push({
                        title: `Update Goal: ${op.args.id}`,
                        from: { date: '...', start_time: '...' },
                        to: { date: 'Adjusted', start_time: 'Now' }
                    });
                }
                // Add more op handlers as needed
            });
        }

        setPreviewData({ preview: { diff, warnings } });
        setShowPreview(true);
    };

    const handleApplyLever = async () => {
        if (!review) return;
        setIsApplying(true); // UI loading state

        try {
            await applyLeverAction(review.lever_action!); // Apply server-side or via patch

            // Update UI to accepted
            setReview({ ...review, user_response: 'accepted' });
            await supabase
                .from('weekly_reviews')
                .update({ user_response: 'accepted' })
                .eq('id', review.id);

            showToast('✅ Protocol synchronized successfully', 'success');
            setShowPreview(false);
        } catch (err) {
            console.error("Apply Failed", err);
            showToast('Failed to apply changes', 'error');
        } finally {
            setIsApplying(false);
        }
    };

    const handleDismissLever = async () => {
        if (!review) return;
        setReview({ ...review, user_response: 'ignored' });
        await supabase
            .from('weekly_reviews')
            .update({ user_response: 'ignored' })
            .eq('id', review.id);
        showToast('Suggestion dismissed', 'info');
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
                <p className="text-sm font-medium tracking-widest uppercase animate-pulse">Checking Review Status...</p>
            </div>
        );
    }

    if (!review) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6">
                <GlassCard padding="lg" className="max-w-md text-center space-y-4">
                    <h2 className="text-xl font-bold">Weekly Review</h2>
                    <p className="text-sm text-[var(--text-secondary)]">
                        Ready to analyze your week?
                    </p>
                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-200">
                            {error}
                        </div>
                    )}
                    <GlassButton
                        variant="primary"
                        size="lg"
                        className="w-full btn-glow"
                        onClick={generateReview}
                        disabled={isGenerating}
                    >
                        {isGenerating ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                                Analyzing...
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-5 h-5 mr-2" />
                                Initiate Review
                            </>
                        )}
                    </GlassButton>
                </GlassCard>
            </div>
        )
    }

    return (
        <div className="max-w-4xl mx-auto space-y-8 pb-20">
            {/* Header */}
            <header className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight">Weekly Review</h1>
                <p className="text-[var(--text-secondary)]">
                    <span className="text-[var(--color-primary)] font-bold">Week {format(new Date(review.week_start), 'w')}</span> Analysis
                </p>
            </header>

            {/* Reality & Patterns Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 1. Reality Anchor */}
                <GlassCard variant="default" padding="lg">
                    <div className="flex items-center gap-2 mb-4">
                        <LineChartIcon className="w-5 h-5 text-blue-400" />
                        <h2 className="text-sm font-bold uppercase tracking-widest text-[var(--text-secondary)]">Reality Anchor</h2>
                    </div>
                    <div className="space-y-4">
                        <div className="flex items-end gap-2">
                            <span className="text-4xl font-bold">
                                {review.actual_minutes && review.planned_minutes ? Math.round((review.actual_minutes / review.planned_minutes) * 100) : 0}%
                            </span>
                            <span className="text-sm text-[var(--text-secondary)] mb-1">Execution</span>
                        </div>
                        <p className="text-sm leading-relaxed text-[var(--text-primary)]">
                            "{review.suggested_adjustment}"
                        </p>
                    </div>
                </GlassCard>

                {/* 2. Detected Patterns */}
                <GlassCard variant="default" padding="lg">
                    <div className="flex items-center gap-2 mb-4">
                        <TrendingUp className="w-5 h-5 text-purple-400" />
                        <h2 className="text-sm font-bold uppercase tracking-widest text-[var(--text-secondary)]">Detected Patterns</h2>
                    </div>
                    <div className="space-y-3">
                        {review.friction_patterns.map((p: any, i: number) => (
                            <div key={i} className="flex items-start gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors group">
                                <div className="mt-1 w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] group-hover:scale-125 transition-transform" />
                                <div>
                                    <p className="text-sm font-bold">{p.title || p}</p>
                                    <p className="text-xs text-[var(--text-secondary)]">{p.impact || ''}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </GlassCard>
            </div>

            {/* 3. The ONE Lever (Strategic Intervention) */}
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
                        <p className="text-xl font-bold tracking-tight text-center mb-4 leading-snug">
                            "{review.lever_action?.description || review.suggested_adjustment}"
                        </p>
                        {(review as any).lever_note && (
                            <p className="text-xs text-center text-[var(--text-tertiary)] mb-6">{(review as any).lever_note}</p>
                        )}

                        {!review.user_response ? (
                            <div className="flex flex-col gap-3">
                                <GlassButton
                                    variant="primary"
                                    size="lg"
                                    onClick={handlePreviewLever}
                                    className="w-full justify-between h-14 group/btn"
                                >
                                    <span className="font-bold tracking-wide">Sync Protocol</span>
                                    <Check className="w-5 h-5 group-hover/btn:scale-110 transition-transform" />
                                </GlassButton>

                                <button
                                    onClick={handleDismissLever}
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

            {/* Modal inside the component */}
            {showPreview && previewData && (
                <PatchPreviewModal
                    isOpen={showPreview}
                    onClose={() => setShowPreview(false)}
                    onApply={handleApplyLever}
                    isApplying={isApplying}
                    previewData={previewData}
                />
            )}
        </div>
    );
}

function Sparkles({ className }: { className?: string }) {
    return (
        <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
    )
}
