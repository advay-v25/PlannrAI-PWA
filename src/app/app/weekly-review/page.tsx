'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toast';
import {
    TrendingUp, TrendingDown, Check, Loader2, ArrowRight, Zap, Brain,
    RotateCcw, AlertTriangle, Target, BarChart3, Calendar, Clock, Flame
} from 'lucide-react';
import { format, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import { apiClient } from '@/lib/api-client';

interface DayBreakdown {
    planned: number;
    completed: number;
    cancelled: number;
}

interface WeeklyMetrics {
    plannedMinutes: number;
    actualMinutes: number;
    completionRate: number;
    totalBlocks: number;
    completedBlocks: number;
    cancelledBlocks: number;
    topPillar: string;
    neglectedPillar: string;
    pillarMinutes?: Record<string, number>;
    habitCompletionRate?: number;
    brainDumpCount?: number;
    avgStress?: number;
}

interface Pattern {
    title: string;
    evidence: string;
}

interface Lever {
    label: string;
    explanation?: string;
    patch?: any;
}

interface WeeklyReviewData {
    reality: string;
    metrics?: WeeklyMetrics;
    patterns: Pattern[];
    lever: Lever;
    note: string;
    dayBreakdown?: Record<string, DayBreakdown>;
}

export default function WeeklyReviewPage() {
    const supabase = createClient();
    const { showToast } = useToast();

    const [review, setReview] = useState<WeeklyReviewData | null>(null);
    const [metrics, setMetrics] = useState<WeeklyMetrics | null>(null);
    const [dayBreakdown, setDayBreakdown] = useState<Record<string, DayBreakdown>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isApplying, setIsApplying] = useState(false);
    const [leverApplied, setLeverApplied] = useState(false);
    const [undoToken, setUndoToken] = useState<string | null>(null);

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
                setReview({
                    reality: data.suggested_adjustment || '',
                    patterns: data.friction_patterns || [],
                    lever: data.lever_action || { label: 'No lever', patch: {} },
                    note: data.lever_note || '',
                    metrics: {
                        plannedMinutes: data.planned_minutes || 0,
                        actualMinutes: data.actual_minutes || 0,
                        completionRate: data.planned_minutes > 0 ? Math.round((data.actual_minutes / data.planned_minutes) * 100) : 0,
                        totalBlocks: 0,
                        completedBlocks: 0,
                        cancelledBlocks: 0,
                        topPillar: '',
                        neglectedPillar: ''
                    }
                });
                setMetrics({
                    plannedMinutes: data.planned_minutes || 0,
                    actualMinutes: data.actual_minutes || 0,
                    completionRate: data.planned_minutes > 0 ? Math.round((data.actual_minutes / data.planned_minutes) * 100) : 0,
                    totalBlocks: 0,
                    completedBlocks: 0,
                    cancelledBlocks: 0,
                    topPillar: '',
                    neglectedPillar: ''
                });
                setLeverApplied(data.user_response === 'accepted');
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
            const res: any = await apiClient.post<any>('/api/weekly-review/generate', {
                week_start: weekStartStr,
                week_end: weekEndStr
            });

            const realMetrics = res.metrics || {};
            const breakdown = res.dayBreakdown || {};

            setMetrics(realMetrics);
            setDayBreakdown(breakdown);

            setReview({
                reality: res.reality || 'No analysis generated.',
                metrics: res.metrics,
                patterns: res.patterns || [],
                lever: res.lever || { label: 'Review Goals', patch: {} },
                note: res.note || ''
            });

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
            const res: any = await apiClient.post('/api/weekly-review/apply', {
                review: {
                    week_start: weekStartStr,
                    week_end: weekEndStr,
                    planned_minutes: metrics?.plannedMinutes || 0,
                    actual_minutes: metrics?.actualMinutes || 0,
                    friction_patterns: review.patterns,
                    suggested_adjustment: review.reality,
                    lever_action: review.lever,
                    lever_note: review.note
                }
            });

            setLeverApplied(true);
            setUndoToken(res.undo_token || null);
            showToast('Lever applied!', 'success');
        } catch (e) {
            console.error(e);
            showToast('Failed to apply lever', 'error');
        } finally {
            setIsApplying(false);
        }
    };

    const handleUndo = async () => {
        if (!undoToken) return;
        try {
            await apiClient.post('/api/coach/undo', { undo_token: undoToken });
            setLeverApplied(false);
            setUndoToken(null);
            showToast('Lever reverted', 'success');
        } catch (e) {
            showToast('Failed to undo', 'error');
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

                <div className="max-w-md w-full text-center space-y-6 p-8 rounded-2xl bg-[var(--glass-bg)] border border-[var(--glass-border)]">
                    <div className="flex justify-center">
                        <div className="p-4 rounded-full bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20">
                            <Brain className="w-8 h-8 text-[var(--color-primary)]" />
                        </div>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold">Performance Analysis</h2>
                        <p className="text-sm text-[var(--text-secondary)] mt-2">
                            I'll analyze your schedule, energy patterns, and goal progress to find the single highest-leverage change for next week.
                        </p>
                    </div>
                    <button
                        onClick={handleGenerate}
                        disabled={isGenerating}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm
                            bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-mind)]
                            text-white shadow-lg shadow-[var(--color-primary)]/20
                            disabled:opacity-50 disabled:cursor-not-allowed
                            hover:brightness-110 active:scale-[0.98] transition-all"
                    >
                        {isGenerating ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> Crunching Data...</>
                        ) : (
                            <><Zap className="w-4 h-4" /> Start Review</>
                        )}
                    </button>
                </div>
            </div>
        );
    }

    // --- The Review UI ---
    const completionRate = metrics?.completionRate || 0;
    const missedHours = metrics ? Math.round((metrics.plannedMinutes - metrics.actualMinutes) / 60) : 0;

    return (
        <div className="max-w-5xl mx-auto space-y-6 pb-20 p-4 md:p-8">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Weekly Review</h1>
                    <p className="text-xs text-[var(--text-tertiary)]">
                        {format(lastWeekStart, 'MMM d')} - {format(lastWeekEnd, 'MMM d')}
                    </p>
                </div>
                {leverApplied && (
                    <div className="flex items-center gap-2">
                        <div className="px-3 py-1 bg-[var(--color-success)]/10 border border-[var(--color-success)]/20 rounded-full text-xs text-[var(--color-success)] font-bold uppercase tracking-wider flex items-center gap-1.5">
                            <Check className="w-3 h-3" /> Applied
                        </div>
                        {undoToken && (
                            <button
                                onClick={handleUndo}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs
                                    bg-[var(--glass-bg)] border border-[var(--glass-border)]
                                    hover:bg-[var(--glass-bg-hover)] text-[var(--text-secondary)] transition-all"
                            >
                                <RotateCcw className="w-3 h-3" /> Undo
                            </button>
                        )}
                    </div>
                )}
            </header>

            {/* METRICS ROW */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricCard
                    icon={<BarChart3 className="w-4 h-4" />}
                    label="Completion"
                    value={`${completionRate}%`}
                    color={completionRate >= 70 ? 'var(--color-success)' : completionRate >= 40 ? 'var(--color-warning)' : 'var(--color-error)'}
                />
                <MetricCard
                    icon={<Clock className="w-4 h-4" />}
                    label="Missed"
                    value={`${Math.max(0, missedHours)}h`}
                    color="var(--color-error)"
                />
                <MetricCard
                    icon={<Target className="w-4 h-4" />}
                    label="Blocks Done"
                    value={`${metrics?.completedBlocks || 0}/${metrics?.totalBlocks || 0}`}
                    color="var(--color-primary)"
                />
                <MetricCard
                    icon={<TrendingUp className="w-4 h-4" />}
                    label="Top Pillar"
                    value={metrics?.topPillar || '—'}
                    color="var(--color-mind)"
                />
            </div>

            {/* DEEP METRICS ROW */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <MetricCard
                    icon={<Check className="w-4 h-4" />}
                    label="Habits"
                    value={`${metrics?.habitCompletionRate || 0}%`}
                    color={metrics?.habitCompletionRate && metrics.habitCompletionRate >= 70 ? 'var(--color-success)' : 'var(--color-primary)'}
                />
                <MetricCard
                    icon={<Brain className="w-4 h-4" />}
                    label="Brain Dumps"
                    value={`${metrics?.brainDumpCount || 0}`}
                    color="var(--color-mind)"
                />
                <MetricCard
                    icon={<Flame className="w-4 h-4" />}
                    label="Avg Stress"
                    value={`${metrics?.avgStress !== undefined ? metrics.avgStress : '—'}`}
                    color={metrics?.avgStress && metrics.avgStress > 0.6 ? 'var(--color-error)' : 'var(--color-warning)'}
                />
            </div>

            {/* DAY-BY-DAY STRIP */}
            {Object.keys(dayBreakdown).length > 0 && (
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {Object.entries(dayBreakdown).sort().map(([date, info]) => {
                        const rate = info.planned > 0 ? Math.round((info.completed / info.planned) * 100) : 0;
                        return (
                            <div key={date} className="flex-shrink-0 flex flex-col items-center gap-1 px-2.5 py-2 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] min-w-[50px]">
                                <span className="text-[10px] text-[var(--text-tertiary)] font-medium">
                                    {format(new Date(date + 'T00:00:00'), 'EEE')}
                                </span>
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${rate >= 80 ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]' :
                                    rate >= 40 ? 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]' :
                                        'bg-[var(--color-error)]/10 text-[var(--color-error)]'
                                    }`}>
                                    {rate}%
                                </div>
                                <span className="text-[9px] text-[var(--text-tertiary)]">{info.completed}/{info.planned}</span>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* PANEL 1: REALITY */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl bg-[var(--glass-bg)] border border-[var(--glass-border)] overflow-hidden"
                >
                    <div className="px-5 py-4 border-b border-[var(--glass-border)]">
                        <div className="flex items-center gap-2 text-[var(--text-secondary)] mb-0.5">
                            <BarChart3 className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Reality</span>
                        </div>
                        <h3 className="text-sm font-bold">What Happened</h3>
                    </div>
                    <div className="px-5 py-4">
                        <p className="text-sm leading-relaxed text-[var(--text-primary)]">{review.reality}</p>
                    </div>
                </motion.div>

                {/* PANEL 2: PATTERNS */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="rounded-2xl bg-[var(--glass-bg)] border border-[var(--glass-border)] overflow-hidden"
                >
                    <div className="px-5 py-4 border-b border-[var(--glass-border)]">
                        <div className="flex items-center gap-2 text-[var(--text-secondary)] mb-0.5">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Patterns</span>
                        </div>
                        <h3 className="text-sm font-bold">Friction Points</h3>
                    </div>
                    <div className="px-5 py-4 space-y-3">
                        {review.patterns.map((pattern, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.08 }}
                            >
                                <h4 className="font-semibold text-sm text-[var(--text-primary)]">{pattern.title}</h4>
                                <p className="text-xs text-[var(--text-secondary)] mt-0.5 pl-3 border-l-2 border-[var(--glass-border)]">
                                    {pattern.evidence}
                                </p>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>

                {/* PANEL 3: THE LEVER */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="rounded-2xl relative overflow-hidden border border-[var(--color-primary)]/20 bg-gradient-to-br from-[var(--color-primary)]/5 to-transparent shadow-lg shadow-[var(--color-primary)]/5"
                >
                    <div className="px-5 py-4 border-b border-[var(--color-primary)]/10">
                        <div className="flex items-center gap-2 text-[var(--color-primary)] mb-0.5">
                            <Zap className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-bold uppercase tracking-widest">The Lever</span>
                        </div>
                        <h3 className="text-sm font-bold">One Change</h3>
                    </div>
                    <div className="px-5 py-4 space-y-3">
                        <h4 className="text-lg font-bold leading-tight">{review.lever.label}</h4>
                        <p className="text-xs text-[var(--text-secondary)]">
                            {review.lever.explanation || review.note || "Apply this high-leverage change to optimize next week."}
                        </p>

                        <div className="pt-3 border-t border-[var(--glass-border)]">
                            {leverApplied ? (
                                <div className="flex items-center justify-center gap-2 py-3">
                                    <div className="w-8 h-8 rounded-full bg-[var(--color-success)]/10 flex items-center justify-center">
                                        <Check className="w-4 h-4 text-[var(--color-success)]" />
                                    </div>
                                    <span className="text-sm font-bold text-[var(--color-success)]">Applied</span>
                                </div>
                            ) : (
                                <button
                                    onClick={handleApplyLever}
                                    disabled={isApplying}
                                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm
                                        bg-[var(--color-primary)] text-white
                                        disabled:opacity-50 disabled:cursor-not-allowed
                                        hover:brightness-110 active:scale-[0.98] transition-all"
                                >
                                    {isApplying ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <>Apply Lever <ArrowRight className="w-3.5 h-3.5" /></>
                                    )}
                                </button>
                            )}
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* AI Note */}
            {review.note && (
                <div className="p-3 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-center">
                    <p className="text-xs text-[var(--text-secondary)] italic">{review.note}</p>
                </div>
            )}
        </div>
    );
}

// --- Sub-Component ---
function MetricCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
    return (
        <div className="p-3 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)]">
            <div className="flex items-center gap-1.5 mb-1" style={{ color }}>
                {icon}
                <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
            </div>
            <div className="text-xl font-bold" style={{ color }}>{value}</div>
        </div>
    );
}
