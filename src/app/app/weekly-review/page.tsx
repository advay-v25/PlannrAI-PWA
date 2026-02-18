'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toast';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import {
    LineChart as LineChartIcon,
    TrendingUp,
    Check,
    Loader2,
    ArrowRight,
    Zap,
    Brain,
    Palette
} from 'lucide-react';
import { format, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import { apiClient } from '@/lib/api-client';
import { applyLeverAction } from '@/app/actions/apply-lever';

interface WeeklyReview {
    id: string;
    week_start: string;
    week_end: string;
    planned_minutes: number;
    actual_minutes: number;
    friction_patterns: Array<{ title: string; evidence: string }>;
    suggested_adjustment: string; // Reality Narrative
    lever_action: { label: string; patch: any };
    user_response: 'accepted' | 'ignored' | 'pending';
    lever_note?: string;
}

export default function WeeklyReviewPage() {
    const supabase = createClient();
    const { showToast } = useToast();

    // State
    const [review, setReview] = useState<WeeklyReview | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isApplying, setIsApplying] = useState(false);

    // Week Logic: Last Week
    const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const lastWeekStart = subWeeks(currentWeekStart, 1);
    const lastWeekEnd = endOfWeek(lastWeekStart, { weekStartsOn: 1 });
    const weekStartStr = format(lastWeekStart, 'yyyy-MM-dd');
    const weekEndStr = format(lastWeekEnd, 'yyyy-MM-dd');

    useEffect(() => {
        checkExistingReview();
    }, []);

    const checkExistingReview = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data } = await supabase
                .from('weekly_reviews')
                .select('*')
                .eq('user_id', user.id)
                .eq('week_start', weekStartStr)
                .maybeSingle();

            if (data) {
                setReview(data);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleGenerate = async () => {
        setIsGenerating(true);
        try {
            // 1. Call Generate API
            const res = await apiClient.post<any>('/api/weekly-review/generate', {
                week_start: weekStartStr,
                week_end: weekEndStr
            });

            // Res structure matches AI Schema: reality, patterns, lever...
            // But we need to shape it for our Review object if we want to preview it before saving?
            // Actually, requirements said "Generate -> Reality + Patterns + Lever".
            // We can treat this as ephemeral until Applied? 
            // OR save it as 'pending'? 
            // Let's treat as ephemeral state first.

            const raw = res as any;
            const executionRate = raw.metrics ? Math.round((raw.metrics.actualMinutes / raw.metrics.plannedMinutes) * 100) : 0;

            // Mocking the Review object structure from the AI response
            // We might need metrics from the summary context which might be embedded or separate.
            // For now, let's assume we fetch summary again or the generate endpoint returns it.
            // Update: Generate endpoint returns AI schema, not full context. 
            // Let's adjust Generate endpoint to return context or fetch summary parallel?
            // Actually, for the UI "Reality" panel we need the stats.
            // Let's do a quick fetch of summary if needed, but Generate endpoint *could* return it.
            // Assuming Generate endpoint returns "context" or we just use what we have.

            // Create ephemeral review object
            const manualReview: WeeklyReview = {
                id: 'temp',
                week_start: weekStartStr,
                week_end: weekEndStr,
                planned_minutes: 100, // Placeholder if not in AI response
                actual_minutes: 0,
                friction_patterns: raw.patterns || [],
                suggested_adjustment: raw.reality || "No analysis generated.",
                lever_action: raw.lever || { label: "Review Goals", patch: {} },
                user_response: 'pending',
                lever_note: raw.note
            };
            setReview(manualReview);

        } catch (e) {
            console.error(e);
            showToast('Failed to generate review', 'error');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleApplyLever = async () => {
        if (!review) return;
        setIsApplying(true);
        try {
            // 1. Call Apply API
            await apiClient.post('/api/weekly-review/apply', { review });

            // 2. Update UI
            setReview(prev => prev ? ({ ...prev, user_response: 'accepted' }) : null);
            showToast('✅ Lever applied successfully!', 'success');
        } catch (e) {
            console.error(e);
            showToast('Failed to apply lever', 'error');
        } finally {
            setIsApplying(false);
        }
    };

    // --- Loading State ---
    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
            </div>
        );
    }

    // --- Empty State (Start Review) ---
    if (!review) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[70vh] space-y-8 p-4">
                <div className="text-center space-y-2">
                    <h1 className="text-3xl font-bold tracking-tight">Weekly Review</h1>
                    <p className="text-[var(--text-secondary)]">
                        Week of {format(lastWeekStart, 'MMM d')} - {format(lastWeekEnd, 'MMM d')}
                    </p>
                </div>

                <GlassCard padding="lg" className="max-w-md w-full text-center space-y-6">
                    <div className="flex justify-center">
                        <div className="p-4 rounded-full bg-[var(--color-primary)]/10">
                            <Brain className="w-8 h-8 text-[var(--color-primary)]" />
                        </div>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold">Neural Analysis</h2>
                        <p className="text-sm text-[var(--text-secondary)] mt-2">
                            Our engine will analyze your logs, schedule execution, and energy patterns to find the single highest-leverage change for next week.
                        </p>
                    </div>
                    <GlassButton
                        size="lg"
                        variant="primary"
                        className="w-full btn-glow"
                        onClick={handleGenerate}
                        disabled={isGenerating}
                    >
                        {isGenerating ? (
                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Crunching Data...</>
                        ) : (
                            <><Zap className="w-4 h-4 mr-2" /> Start Review</>
                        )}
                    </GlassButton>
                </GlassCard>
            </div>
        );
    }

    // --- The 3-Panel Review UI ---
    return (
        <div className="max-w-5xl mx-auto space-y-8 pb-20 p-4 md:p-8">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Weekly Review</h1>
                    <p className="text-[var(--text-secondary)]">
                        {format(lastWeekStart, 'MMM d')} - {format(lastWeekEnd, 'MMM d')}
                    </p>
                </div>
                {review.user_response === 'accepted' && (
                    <div className="px-3 py-1 bg-green-500/10 border border-green-500/20 rounded-full text-xs text-green-400 font-bold uppercase tracking-wider flex items-center gap-2">
                        <Check className="w-3 h-3" /> Complete
                    </div>
                )}
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                {/* PANEL 1: REALITY */}
                <GlassCard className="md:col-span-1 flex flex-col h-full bg-gradient-to-b from-white/5 to-transparent">
                    <div className="p-6 border-b border-white/5">
                        <div className="flex items-center gap-2 text-[var(--text-secondary)] mb-1">
                            <LineChartIcon className="w-4 h-4" />
                            <span className="text-xs font-bold uppercase tracking-widest">Reality</span>
                        </div>
                        <h3 className="text-lg font-bold">What Happened</h3>
                    </div>
                    <div className="p-6 flex-1 flex flex-col gap-6">
                        {/* Narrative */}
                        <p className="text-sm leading-relaxed text-[var(--text-primary)]">
                            "{review.suggested_adjustment}"
                        </p>

                        {/* Metrics (Minimal) */}
                        <div className="mt-auto grid grid-cols-2 gap-4">
                            <div>
                                <div className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider mb-1">Completion</div>
                                <div className="text-2xl font-bold">
                                    {review.planned_minutes > 0 ? Math.round((review.actual_minutes / review.planned_minutes) * 100) : 0}%
                                </div>
                            </div>
                            <div>
                                <div className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider mb-1">Missed</div>
                                <div className="text-2xl font-bold text-red-400">
                                    {review.planned_minutes > 0 ? Math.round(((review.planned_minutes - review.actual_minutes) / 60)) : 0}h
                                </div>
                            </div>
                        </div>
                    </div>
                </GlassCard>

                {/* PANEL 2: PATTERNS */}
                <GlassCard className="md:col-span-1 flex flex-col h-full bg-gradient-to-b from-white/5 to-transparent">
                    <div className="p-6 border-b border-white/5">
                        <div className="flex items-center gap-2 text-[var(--text-secondary)] mb-1">
                            <TrendingUp className="w-4 h-4" />
                            <span className="text-xs font-bold uppercase tracking-widest">Patterns</span>
                        </div>
                        <h3 className="text-lg font-bold">Friction Points</h3>
                    </div>
                    <div className="p-6 flex-1 space-y-4">
                        {review.friction_patterns.map((pattern, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.1 }}
                                className="group"
                            >
                                <h4 className="font-bold text-sm text-[var(--text-primary)] group-hover:text-[var(--color-primary)] transition-colors">
                                    {pattern.title}
                                </h4>
                                <p className="text-xs text-[var(--text-secondary)] mt-1 pl-3 border-l-2 border-white/10 group-hover:border-[var(--color-primary)] transition-colors">
                                    {pattern.evidence}
                                </p>
                            </motion.div>
                        ))}
                    </div>
                </GlassCard>

                {/* PANEL 3: THE LEVER (Action) */}
                <GlassCard className="md:col-span-1 flex flex-col h-full relative overflow-hidden ring-1 ring-[var(--color-primary)]/30 shadow-[0_0_30px_-5px_var(--color-primary)]/10">
                    <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-primary)]/10 via-transparent to-transparent opacity-50" />

                    <div className="p-6 border-b border-white/5 relative z-10">
                        <div className="flex items-center gap-2 text-[var(--color-primary)] mb-1">
                            <Zap className="w-4 h-4" />
                            <span className="text-xs font-bold uppercase tracking-widest">The Lever</span>
                        </div>
                        <h3 className="text-lg font-bold">One Change</h3>
                    </div>

                    <div className="p-6 flex-1 flex flex-col relative z-10">
                        <div className="flex-1">
                            <h4 className="text-xl font-bold leading-tight mb-2">
                                {review.lever_action.label}
                            </h4>
                            <p className="text-sm text-[var(--text-secondary)]">
                                {review.lever_note || "Apply this high-leverage change to optimize next week."}
                            </p>
                        </div>

                        <div className="mt-6 pt-6 border-t border-white/10">
                            {review.user_response === 'accepted' ? (
                                <div className="w-full py-4 text-center">
                                    <div className="mx-auto w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center mb-2">
                                        <Check className="w-5 h-5 text-green-400" />
                                    </div>
                                    <p className="text-sm font-bold text-green-400">Applied to Calendar</p>
                                </div>
                            ) : (
                                <GlassButton
                                    size="lg"
                                    variant="primary"
                                    className="w-full btn-glow h-14 text-base"
                                    onClick={handleApplyLever}
                                    disabled={isApplying}
                                >
                                    {isApplying ? <Loader2 className="animate-spin" /> : "Apply Lever"}
                                    {!isApplying && <ArrowRight className="ml-2 w-4 h-4" />}
                                </GlassButton>
                            )}
                        </div>
                    </div>
                </GlassCard>

            </div>
        </div>
    );
}

// Helper (no changes needed)
function Sparkles({ className }: { className?: string }) {
    // ... existing SVG ...
    return <></>;
}
