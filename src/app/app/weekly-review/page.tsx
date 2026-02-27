'use client';

import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toast';
import {
    TrendingUp, TrendingDown, Check, Loader2, ArrowRight, ArrowLeft, Zap, Brain,
    RotateCcw, AlertTriangle, Target, BarChart3, Calendar, Clock, Flame,
    MessageCircle, Sparkles, BookOpen, Shield, ChevronRight
} from 'lucide-react';
import { format, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import { apiClient } from '@/lib/api-client';

// --- Types ---

interface DayBreakdown { planned: number; completed: number; cancelled: number; }
interface WeeklyMetrics {
    plannedMinutes: number; actualMinutes: number; completionRate: number;
    totalBlocks: number; completedBlocks: number; cancelledBlocks: number;
    topPillar: string; neglectedPillar: string;
    pillarMinutes?: Record<string, number>;
    habitCompletionRate?: number; brainDumpCount?: number; avgStress?: number;
}
interface Pattern { title: string; evidence: string; }
interface Lever { label: string; explanation?: string; patch?: any; }
interface WeeklyReviewData {
    reality: string; metrics?: WeeklyMetrics; patterns: Pattern[];
    lever: Lever; note: string; dayBreakdown?: Record<string, DayBreakdown>;
}

const STEPS = ['Score', 'Patterns', 'Reflect', 'Plan Next Week'] as const;
type Step = typeof STEPS[number];

export default function WeeklyReviewPage() {
    const supabase = createClient();
    const { showToast } = useToast();

    const [currentStep, setCurrentStep] = useState(0);
    const [review, setReview] = useState<WeeklyReviewData | null>(null);
    const [metrics, setMetrics] = useState<WeeklyMetrics | null>(null);
    const [dayBreakdown, setDayBreakdown] = useState<Record<string, DayBreakdown>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isApplying, setIsApplying] = useState(false);
    const [leverApplied, setLeverApplied] = useState(false);
    const [undoToken, setUndoToken] = useState<string | null>(null);

    // Reflection inputs
    const [whatWorked, setWhatWorked] = useState('');
    const [challenges, setChallenges] = useState('');
    const [overallEnergy, setOverallEnergy] = useState<string>('');
    const [newRules, setNewRules] = useState<string[]>([]);
    const [ruleInput, setRuleInput] = useState('');

    // Week logic
    const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const lastWeekStart = subWeeks(currentWeekStart, 1);
    const lastWeekEnd = endOfWeek(lastWeekStart, { weekStartsOn: 1 });
    const weekStartStr = format(lastWeekStart, 'yyyy-MM-dd');
    const weekEndStr = format(lastWeekEnd, 'yyyy-MM-dd');

    useEffect(() => { checkExistingReview(); }, []);

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
                    reality: data.what_worked || data.ai_patterns?.reality || '',
                    patterns: data.ai_patterns?.patterns || [],
                    lever: data.ai_suggestions?.lever || { label: 'No lever', patch: {} },
                    note: data.ai_suggestions?.note || '',
                    metrics: {
                        plannedMinutes: 0, actualMinutes: 0,
                        completionRate: data.completion_percent || 0,
                        totalBlocks: data.total_blocks || 0,
                        completedBlocks: data.completed_blocks || 0,
                        cancelledBlocks: data.skipped_blocks || 0,
                        topPillar: '', neglectedPillar: ''
                    }
                });
                setMetrics({
                    plannedMinutes: 0, actualMinutes: 0,
                    completionRate: data.completion_percent || 0,
                    totalBlocks: data.total_blocks || 0,
                    completedBlocks: data.completed_blocks || 0,
                    cancelledBlocks: data.skipped_blocks || 0,
                    topPillar: '', neglectedPillar: ''
                });
                setWhatWorked(data.what_worked || '');
                setChallenges(data.challenges || '');
                setOverallEnergy(data.overall_energy || '');
            }
        } catch (e) { console.error(e); }
        finally { setIsLoading(false); }
    };

    const handleGenerate = async () => {
        setIsGenerating(true);
        try {
            const res: any = await apiClient.post<any>('/api/weekly-review/generate', {
                week_start: weekStartStr, week_end: weekEndStr
            });
            setMetrics(res.metrics || {});
            setDayBreakdown(res.dayBreakdown || {});
            setReview({
                reality: res.reality || 'No analysis generated.',
                metrics: res.metrics,
                patterns: res.patterns || [],
                lever: res.lever || { label: 'Review Goals', patch: {} },
                note: res.note || '',
                dayBreakdown: res.dayBreakdown
            });
            setCurrentStep(0);
        } catch (e) {
            console.error(e);
            showToast('Failed to generate review', 'error');
        } finally { setIsGenerating(false); }
    };

    const handleApplyLever = async () => {
        if (!review) return;
        setIsApplying(true);
        try {
            const res: any = await apiClient.post('/api/weekly-review/apply', {
                review: {
                    week_start: weekStartStr, week_end: weekEndStr,
                    planned_minutes: metrics?.plannedMinutes || 0,
                    actual_minutes: metrics?.actualMinutes || 0,
                    friction_patterns: review.patterns,
                    suggested_adjustment: review.reality,
                    lever_action: review.lever, lever_note: review.note,
                    what_worked: whatWorked, challenges,
                    overall_energy: overallEnergy, new_rules: newRules
                }
            });
            setLeverApplied(true);
            setUndoToken(res.undo_token || null);
            showToast('Weekly review saved & lever applied!', 'success');
        } catch (e) {
            console.error(e);
            showToast('Failed to apply lever', 'error');
        } finally { setIsApplying(false); }
    };

    const handleUndo = async () => {
        if (!undoToken) return;
        try {
            await apiClient.post('/api/coach/undo', { undo_token: undoToken });
            setLeverApplied(false); setUndoToken(null);
            showToast('Lever reverted', 'success');
        } catch (e) { showToast('Failed to undo', 'error'); }
    };

    const addRule = () => {
        if (ruleInput.trim()) {
            setNewRules(prev => [...prev, ruleInput.trim()]);
            setRuleInput('');
        }
    };

    // --- Loading ---
    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
            </div>
        );
    }

    // --- Start Screen ---
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
                        <h2 className="text-xl font-bold">4-Step Review</h2>
                        <p className="text-sm text-[var(--text-secondary)] mt-2">
                            Score → Patterns → Reflect → Plan Next Week
                        </p>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                        {STEPS.map((step, i) => (
                            <div key={step} className="flex flex-col items-center gap-1">
                                <div className="w-8 h-8 rounded-full bg-[var(--glass-bg)] border border-[var(--glass-border)] flex items-center justify-center text-xs font-bold text-[var(--text-secondary)]">{i + 1}</div>
                                <span className="text-[10px] text-[var(--text-tertiary)]">{step}</span>
                            </div>
                        ))}
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

    // --- Wizard UI ---
    const completionRate = metrics?.completionRate || 0;
    const missedHours = metrics ? Math.round((metrics.plannedMinutes - metrics.actualMinutes) / 60) : 0;

    return (
        <div className="max-w-2xl mx-auto pb-20 p-4 md:p-6">
            {/* Header & Progress */}
            <header className="mb-6">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h1 className="text-xl font-bold tracking-tight">Weekly Review</h1>
                        <p className="text-xs text-[var(--text-tertiary)]">
                            {format(lastWeekStart, 'MMM d')} - {format(lastWeekEnd, 'MMM d')}
                        </p>
                    </div>
                    <div className="text-xs font-medium text-[var(--text-secondary)]">
                        Step {currentStep + 1} of {STEPS.length}
                    </div>
                </div>
                {/* Progress Bar */}
                <div className="flex gap-1.5">
                    {STEPS.map((step, i) => (
                        <button
                            key={step}
                            onClick={() => setCurrentStep(i)}
                            className="flex-1 group"
                        >
                            <div className={`h-1.5 rounded-full transition-all ${i <= currentStep
                                    ? 'bg-[var(--color-primary)]'
                                    : 'bg-[var(--glass-border)]'
                                }`} />
                            <span className={`text-[10px] mt-1 block text-center transition-colors ${i === currentStep ? 'text-[var(--color-primary)] font-bold' : 'text-[var(--text-tertiary)]'
                                }`}>{step}</span>
                        </button>
                    ))}
                </div>
            </header>

            {/* Step Content */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={currentStep}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.25 }}
                >
                    {/* STEP 1: SCORE */}
                    {currentStep === 0 && (
                        <div className="space-y-4">
                            {/* Big Score */}
                            <div className="text-center py-8">
                                <div className={`text-6xl font-black ${completionRate >= 70 ? 'text-[var(--color-success)]' :
                                        completionRate >= 40 ? 'text-[var(--color-warning)]' :
                                            'text-[var(--color-error)]'
                                    }`}>
                                    {completionRate}%
                                </div>
                                <p className="text-sm text-[var(--text-secondary)] mt-1">completion rate</p>
                            </div>

                            {/* Metrics Grid */}
                            <div className="grid grid-cols-2 gap-3">
                                <MetricCard icon={<Target className="w-4 h-4" />} label="Blocks Done" value={`${metrics?.completedBlocks || 0}/${metrics?.totalBlocks || 0}`} color="var(--color-primary)" />
                                <MetricCard icon={<Clock className="w-4 h-4" />} label="Missed" value={`${Math.max(0, missedHours)}h`} color="var(--color-error)" />
                                <MetricCard icon={<TrendingUp className="w-4 h-4" />} label="Top Pillar" value={metrics?.topPillar || '—'} color="var(--color-mind)" />
                                <MetricCard icon={<TrendingDown className="w-4 h-4" />} label="Neglected" value={metrics?.neglectedPillar || '—'} color="var(--color-warning)" />
                            </div>

                            {/* Day Strip */}
                            {Object.keys(dayBreakdown).length > 0 && (
                                <div className="space-y-2">
                                    <h3 className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">Day by Day</h3>
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
                                                        }`}>{rate}%</div>
                                                    <span className="text-[9px] text-[var(--text-tertiary)]">{info.completed}/{info.planned}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Reality */}
                            <div className="p-4 rounded-2xl bg-[var(--glass-bg)] border border-[var(--glass-border)]">
                                <div className="flex items-center gap-1.5 mb-2">
                                    <BarChart3 className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                                    <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">AI Summary</span>
                                </div>
                                <p className="text-sm leading-relaxed text-[var(--text-primary)]">{review.reality}</p>
                            </div>
                        </div>
                    )}

                    {/* STEP 2: PATTERNS */}
                    {currentStep === 1 && (
                        <div className="space-y-4">
                            <div className="text-center py-4">
                                <div className="w-12 h-12 mx-auto rounded-full bg-[var(--color-warning)]/10 flex items-center justify-center mb-2">
                                    <AlertTriangle className="w-5 h-5 text-[var(--color-warning)]" />
                                </div>
                                <h2 className="text-lg font-bold">Friction Points</h2>
                                <p className="text-xs text-[var(--text-secondary)]">Where you lost momentum</p>
                            </div>

                            <div className="space-y-3">
                                {review.patterns.map((pattern, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.1 }}
                                        className="p-4 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)]"
                                    >
                                        <h4 className="font-semibold text-sm text-[var(--text-primary)] flex items-center gap-2">
                                            <span className="w-5 h-5 rounded-full bg-[var(--color-warning)]/10 flex items-center justify-center text-[10px] font-bold text-[var(--color-warning)]">{i + 1}</span>
                                            {pattern.title}
                                        </h4>
                                        <p className="text-xs text-[var(--text-secondary)] mt-1.5 pl-7">{pattern.evidence}</p>
                                    </motion.div>
                                ))}
                                {review.patterns.length === 0 && (
                                    <div className="text-center py-8 text-[var(--text-tertiary)] text-sm">
                                        No patterns detected — great week! 🎉
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* STEP 3: REFLECT */}
                    {currentStep === 2 && (
                        <div className="space-y-5">
                            <div className="text-center py-4">
                                <div className="w-12 h-12 mx-auto rounded-full bg-[var(--color-mind)]/10 flex items-center justify-center mb-2">
                                    <BookOpen className="w-5 h-5 text-[var(--color-mind)]" />
                                </div>
                                <h2 className="text-lg font-bold">Reflect</h2>
                                <p className="text-xs text-[var(--text-secondary)]">Your thoughts on this week</p>
                            </div>

                            {/* Energy Check */}
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Overall Energy</label>
                                <div className="flex gap-2">
                                    {['low', 'okay', 'good', 'great'].map(level => (
                                        <button
                                            key={level}
                                            onClick={() => setOverallEnergy(level)}
                                            className={`flex-1 py-2 rounded-xl text-xs font-bold capitalize transition-all ${overallEnergy === level
                                                    ? 'bg-[var(--color-primary)] text-white'
                                                    : 'bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)]'
                                                }`}
                                        >
                                            {level === 'low' && '😩'} {level === 'okay' && '😐'}
                                            {level === 'good' && '😊'} {level === 'great' && '🔥'}
                                            <span className="block mt-0.5">{level}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* What Worked */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">What Worked</label>
                                <textarea
                                    value={whatWorked}
                                    onChange={e => setWhatWorked(e.target.value)}
                                    placeholder="What went well? What should you keep doing?"
                                    className="w-full h-20 p-3 text-sm text-[var(--text-primary)]
                                        bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl
                                        placeholder:text-[var(--text-tertiary)] outline-none resize-none
                                        focus:border-[var(--color-primary)]/30 transition-all"
                                />
                            </div>

                            {/* Challenges */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Challenges</label>
                                <textarea
                                    value={challenges}
                                    onChange={e => setChallenges(e.target.value)}
                                    placeholder="What was hard? What got in the way?"
                                    className="w-full h-20 p-3 text-sm text-[var(--text-primary)]
                                        bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl
                                        placeholder:text-[var(--text-tertiary)] outline-none resize-none
                                        focus:border-[var(--color-primary)]/30 transition-all"
                                />
                            </div>

                            {/* Personal Rules */}
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-1.5">
                                    <Shield className="w-3 h-3" /> New Personal Rules
                                </label>
                                <p className="text-[10px] text-[var(--text-tertiary)]">Rules that guide AI scheduling. e.g. &quot;Gym must be before noon&quot;</p>
                                <div className="flex gap-2">
                                    <input
                                        value={ruleInput}
                                        onChange={e => setRuleInput(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') addRule(); }}
                                        placeholder="Add a rule..."
                                        className="flex-1 px-3 py-2 text-xs bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-lg
                                            text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none
                                            focus:border-[var(--color-primary)]/30 transition-all"
                                    />
                                    <button onClick={addRule} className="px-3 py-2 rounded-lg text-xs font-bold bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20 transition-all">
                                        Add
                                    </button>
                                </div>
                                {newRules.length > 0 && (
                                    <div className="space-y-1.5">
                                        {newRules.map((rule, i) => (
                                            <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)]">
                                                <Shield className="w-3 h-3 text-[var(--color-primary)] flex-shrink-0" />
                                                <span className="text-xs text-[var(--text-primary)] flex-1">&quot;{rule}&quot;</span>
                                                <button
                                                    onClick={() => setNewRules(prev => prev.filter((_, j) => j !== i))}
                                                    className="text-[var(--text-tertiary)] hover:text-[var(--color-error)] transition-colors text-xs"
                                                >✕</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* STEP 4: PLAN NEXT WEEK */}
                    {currentStep === 3 && (
                        <div className="space-y-5">
                            <div className="text-center py-4">
                                <div className="w-12 h-12 mx-auto rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center mb-2">
                                    <Zap className="w-5 h-5 text-[var(--color-primary)]" />
                                </div>
                                <h2 className="text-lg font-bold">The Lever</h2>
                                <p className="text-xs text-[var(--text-secondary)]">One high-leverage change for next week</p>
                            </div>

                            {/* The Lever Card */}
                            <div className="rounded-2xl relative overflow-hidden border border-[var(--color-primary)]/20 bg-gradient-to-br from-[var(--color-primary)]/5 to-transparent shadow-lg shadow-[var(--color-primary)]/5 p-5 space-y-3">
                                <h4 className="text-lg font-bold leading-tight">{review.lever.label}</h4>
                                <p className="text-xs text-[var(--text-secondary)]">
                                    {review.lever.explanation || review.note || "Apply this high-leverage change to optimize next week."}
                                </p>

                                <div className="pt-3 border-t border-[var(--glass-border)]">
                                    {leverApplied ? (
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-full bg-[var(--color-success)]/10 flex items-center justify-center">
                                                    <Check className="w-4 h-4 text-[var(--color-success)]" />
                                                </div>
                                                <span className="text-sm font-bold text-[var(--color-success)]">Applied!</span>
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
                                    ) : (
                                        <button
                                            onClick={handleApplyLever}
                                            disabled={isApplying}
                                            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm
                                                bg-[var(--color-primary)] text-white
                                                disabled:opacity-50 disabled:cursor-not-allowed
                                                hover:brightness-110 active:scale-[0.98] transition-all"
                                        >
                                            {isApplying ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Complete Review & Apply <ArrowRight className="w-3.5 h-3.5" /></>}
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Summary */}
                            {(whatWorked || challenges) && (
                                <div className="p-4 rounded-2xl bg-[var(--glass-bg)] border border-[var(--glass-border)] space-y-3">
                                    <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Your Reflections</h4>
                                    {whatWorked && <div className="text-xs text-[var(--text-primary)]"><span className="text-[var(--color-success)] font-bold">✓ Worked:</span> {whatWorked}</div>}
                                    {challenges && <div className="text-xs text-[var(--text-primary)]"><span className="text-[var(--color-error)] font-bold">✗ Challenge:</span> {challenges}</div>}
                                </div>
                            )}

                            {/* Rules Summary */}
                            {newRules.length > 0 && (
                                <div className="p-4 rounded-2xl bg-[var(--glass-bg)] border border-[var(--glass-border)] space-y-2">
                                    <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">New Rules ({newRules.length})</h4>
                                    {newRules.map((rule, i) => (
                                        <div key={i} className="text-xs text-[var(--text-primary)] flex items-center gap-1.5">
                                            <Shield className="w-3 h-3 text-[var(--color-primary)]" /> &quot;{rule}&quot;
                                        </div>
                                    ))}
                                </div>
                            )}

                            {review.note && (
                                <div className="p-3 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-center">
                                    <p className="text-xs text-[var(--text-secondary)] italic">{review.note}</p>
                                </div>
                            )}
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>

            {/* Navigation */}
            <div className="flex justify-between mt-8 pt-4 border-t border-[var(--glass-border)]">
                <button
                    onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
                    disabled={currentStep === 0}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium
                        bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-secondary)]
                        hover:bg-[var(--glass-bg-hover)] disabled:opacity-30 transition-all"
                >
                    <ArrowLeft className="w-3.5 h-3.5" /> Back
                </button>
                {currentStep < STEPS.length - 1 && (
                    <button
                        onClick={() => setCurrentStep(currentStep + 1)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold
                            bg-[var(--color-primary)] text-white
                            hover:brightness-110 active:scale-[0.98] transition-all"
                    >
                        Next <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>
        </div>
    );
}

// --- Sub-Components ---
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
