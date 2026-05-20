'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { Loader2, ArrowRight, ArrowLeft, Brain, Zap, Target, Star, AlertTriangle, MessageCircle, X, CheckCircle2, Circle, ArrowDownRight } from 'lucide-react';

interface ProposedChange {
    goal_id: string;
    title: string;
    change_type: "update_time" | "update_days" | "pause" | "delete";
    old_value: string;
    new_value: string;
    rationale: string;
}

interface ReportResponse {
    data: {
        summary: string;
        achievements: string[];
        struggles: string[];
        proposed_goal_changes: ProposedChange[];
    };
    metrics: {
        plannedMinutes: number;
        completedMinutes: number;
        skippedMinutes: number;
        goalStats: Record<string, any>;
    };
    weekStart: string;
    weekEnd: string;
}

export default function WeeklyReviewPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(true);
    const [report, setReport] = useState<ReportResponse | null>(null);
    const [isExecuting, setIsExecuting] = useState(false);
    
    // UI State
    const [view, setView] = useState<'report' | 'semi-auto' | 'done'>('report');
    
    // Semi-auto state
    const [approvedChanges, setApprovedChanges] = useState<Set<string>>(new Set());

    useEffect(() => {
        // Fetch AI Report
        const fetchReport = async () => {
            try {
                const res = await apiClient.post<ReportResponse>('/api/weekly-review/generate-report', {});
                setReport(res);
                
                // By default approve all
                if (res.data?.proposed_goal_changes) {
                    setApprovedChanges(new Set(res.data.proposed_goal_changes.map(c => c.goal_id)));
                }
            } catch (err) {
                console.error(err);
                toast.error('Failed to generate weekly report');
            } finally {
                setIsLoading(false);
            }
        };
        fetchReport();
    }, []);

    const handleExecute = async (mode: 'auto' | 'semi-auto' | 'manual', finalChanges?: ProposedChange[]) => {
        setIsExecuting(true);

        try {
            if (mode === 'auto') {
                toast.loading('Applying AI changes automatically...', { id: 'exec' });
                await apiClient.post('/api/weekly-review/execute', { 
                    mode: 'auto',
                    changes: report?.data?.proposed_goal_changes || []
                });
                toast.success('Goals updated!', { id: 'exec' });
                setView('done');
            } else if (mode === 'semi-auto') {
                if (!finalChanges) {
                    // Go to review screen
                    setView('semi-auto');
                    setIsExecuting(false);
                    return;
                }
                toast.loading('Applying selected changes...', { id: 'exec' });
                await apiClient.post('/api/weekly-review/execute', { 
                    mode: 'semi-auto',
                    changes: finalChanges
                });
                toast.success('Selected changes applied!', { id: 'exec' });
                setView('done');
            } else {
                // Manual
                toast.success('Continuing in manual mode.', { id: 'exec' });
                router.push('/app/goals');
            }
        } catch (e) {
            toast.error('Failed to execute actions.', { id: 'exec' });
        } finally {
            if (mode !== 'semi-auto' || finalChanges) {
                setIsExecuting(false);
            }
        }
    };

    const toggleChange = (goalId: string) => {
        setApprovedChanges(prev => {
            const next = new Set(prev);
            if (next.has(goalId)) next.delete(goalId);
            else next.add(goalId);
            return next;
        });
    };

    const applySemiAuto = () => {
        const changesToApply = (report?.data.proposed_goal_changes || []).filter(c => approvedChanges.has(c.goal_id));
        handleExecute('semi-auto', changesToApply);
    };

    const exitReview = () => {
        router.push('/app');
    };

    return (
        <div className="max-w-3xl mx-auto pb-20 p-4 md:p-6 min-h-screen flex flex-col">
            {/* SVG organic ribbon flows — purple palette */}
            <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none', overflow: 'hidden' }}>
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
                background: 'linear-gradient(to right, transparent, hsla(270,82%,62%,0.55) 40%, hsla(290,80%,65%,0.42) 65%, transparent)',
              }} />
              <svg
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                viewBox="0 0 1440 900"
                preserveAspectRatio="xMidYMid slice"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  <linearGradient id="review-r1" x1="1440" y1="-100" x2="0" y2="900" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="hsla(270,82%,62%,0.42)" />
                    <stop offset="40%" stopColor="hsla(275,78%,44%,0.22)" />
                    <stop offset="100%" stopColor="hsla(280,65%,18%,0)" />
                  </linearGradient>
                  <linearGradient id="review-r2" x1="1440" y1="200" x2="200" y2="900" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="hsla(290,75%,58%,0.24)" />
                    <stop offset="55%" stopColor="hsla(270,78%,50%,0.12)" />
                    <stop offset="100%" stopColor="transparent" />
                  </linearGradient>
                  <linearGradient id="review-r3" x1="1" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsla(270,82%,56%,0.20)" />
                    <stop offset="100%" stopColor="transparent" />
                  </linearGradient>
                  <filter id="review-shadow" x="-60%" y="-60%" width="220%" height="220%">
                    <feGaussianBlur stdDeviation="30" />
                  </filter>
                  <filter id="review-glow" x="-60%" y="-60%" width="220%" height="220%">
                    <feGaussianBlur stdDeviation="10" />
                  </filter>
                </defs>

                <path d="M 1600 -200 C 1300 20 1050 200 820 390 C 590 580 370 720 0 890 L 0 1000 L 1600 1000 Z" fill="url(#review-r1)" />
                <path d="M 1430 -60 C 1130 170 890 350 670 530 C 450 710 240 830 -80 920" stroke="hsla(270,60%,5%,0.55)" strokeWidth="100" fill="none" filter="url(#review-shadow)" />
                <path d="M 1430 -60 C 1130 170 890 350 670 530 C 450 710 240 830 -80 920" stroke="hsla(270,90%,78%,0.55)" strokeWidth="1.5" fill="none" />
                <path d="M 1430 -60 C 1130 170 890 350 670 530 C 450 710 240 830 -80 920" stroke="hsla(270,88%,65%,0.28)" strokeWidth="38" fill="none" filter="url(#review-glow)" />

                <path d="M 1600 160 C 1300 360 1050 510 820 660 C 590 810 370 890 0 980 L 0 1000 L 1600 1000 Z" fill="url(#review-r2)" />
                <path d="M 1430 220 C 1130 420 890 570 670 710 C 450 850 240 930 -80 1000" stroke="hsla(280,88%,70%,0.32)" strokeWidth="1.5" fill="none" />
                <path d="M 1430 220 C 1130 420 890 570 670 710 C 450 850 240 930 -80 1000" stroke="hsla(270,88%,62%,0.18)" strokeWidth="32" fill="none" filter="url(#review-glow)" />
                <path d="M 1600 -350 C 1500 -180 1350 -70 1200 40 C 1050 150 950 230 820 340 L 1600 340 Z" fill="url(#review-r3)" />
              </svg>
            </div>

            <header className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">AI Weekly Review</h1>
                    <p className="text-sm text-[var(--text-tertiary)]">Reflect and recalibrate with PlannrAI</p>
                </div>
                <button
                    onClick={exitReview}
                    className="p-2 rounded-xl bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-[var(--text-secondary)] transition-colors flex items-center gap-2 text-sm font-medium"
                >
                    <X className="w-4 h-4" /> Exit
                </button>
            </header>

            <div className="flex-1 flex flex-col items-center">
                <AnimatePresence mode="wait">
                    
                    {isLoading && (
                        <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center py-32 space-y-4">
                            <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
                            <p className="text-[var(--text-secondary)] font-medium animate-pulse">AI is reading your week's progress...</p>
                        </motion.div>
                    )}

                    {!isLoading && report && view === 'report' && (
                        <motion.div key="report" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }} className="w-full space-y-8">
                            
                            {/* Summary Card */}
                            <div className="p-6 rounded-3xl bg-[var(--glass-bg)] border border-[var(--glass-border)] backdrop-blur-xl">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-10 h-10 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center">
                                        <Brain className="w-5 h-5 text-[var(--color-primary)]" />
                                    </div>
                                    <h2 className="text-xl font-bold">Week in Review</h2>
                                </div>
                                <p className="text-[var(--text-primary)] leading-relaxed text-sm md:text-base">
                                    {report.data.summary}
                                </p>
                                
                                <div className="mt-6 flex gap-4 text-sm font-medium">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                        <span>{Math.round(report.metrics.completedMinutes / 60)}h Completed</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-red-500" />
                                        <span>{Math.round(report.metrics.skippedMinutes / 60)}h Skipped</span>
                                    </div>
                                </div>
                            </div>

                            {/* Achievements & Struggles */}
                            <div className="grid md:grid-cols-2 gap-4">
                                <div className="p-5 rounded-2xl bg-emerald-500/5 border border-emerald-500/20">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Star className="w-5 h-5 text-emerald-500" />
                                        <h3 className="font-bold text-emerald-500">Wins</h3>
                                    </div>
                                    <ul className="space-y-2">
                                        {report.data.achievements.map((ach, i) => (
                                            <li key={i} className="text-sm text-[var(--text-secondary)] flex items-start gap-2">
                                                <span className="text-emerald-500 mt-0.5">•</span> {ach}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="p-5 rounded-2xl bg-red-500/5 border border-red-500/20">
                                    <div className="flex items-center gap-2 mb-3">
                                        <AlertTriangle className="w-5 h-5 text-red-500" />
                                        <h3 className="font-bold text-red-500">Struggles</h3>
                                    </div>
                                    <ul className="space-y-2">
                                        {report.data.struggles.map((strug, i) => (
                                            <li key={i} className="text-sm text-[var(--text-secondary)] flex items-start gap-2">
                                                <span className="text-red-500 mt-0.5">•</span> {strug}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>

                            {/* Options to proceed */}
                            <div className="pt-8 border-t border-[var(--glass-border)]">
                                <h3 className="text-lg font-bold mb-4 text-center">How would you like to proceed?</h3>
                                <div className="grid md:grid-cols-3 gap-4">
                                    <button
                                        onClick={() => handleExecute('auto')}
                                        disabled={isExecuting}
                                        className="flex flex-col items-start p-5 rounded-2xl bg-[var(--color-primary)]/10 hover:bg-[var(--color-primary)]/20 border border-[var(--color-primary)]/30 transition-all text-left disabled:opacity-50"
                                    >
                                        <span className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2 mb-2">
                                            <Zap className="w-4 h-4 text-[var(--color-primary)]" /> Automatic
                                        </span>
                                        <span className="text-xs text-[var(--text-secondary)] leading-relaxed">
                                            AI immediately applies its proposed goal adjustments and prioritizes for next week.
                                        </span>
                                    </button>

                                    <button
                                        onClick={() => handleExecute('semi-auto')}
                                        disabled={isExecuting || report.data.proposed_goal_changes.length === 0}
                                        className="flex flex-col items-start p-5 rounded-2xl bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] transition-all text-left disabled:opacity-50"
                                    >
                                        <span className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2 mb-2">
                                            <Target className="w-4 h-4 text-[var(--color-mind)]" /> Semi-Automated
                                        </span>
                                        <span className="text-xs text-[var(--text-tertiary)] leading-relaxed">
                                            Review {report.data.proposed_goal_changes.length} proposed AI changes to your goals before applying.
                                        </span>
                                    </button>

                                    <button
                                        onClick={() => handleExecute('manual')}
                                        disabled={isExecuting}
                                        className="flex flex-col items-start p-5 rounded-2xl bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] transition-all text-left disabled:opacity-50"
                                    >
                                        <span className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2 mb-2">
                                            <MessageCircle className="w-4 h-4" /> Manual
                                        </span>
                                        <span className="text-xs text-[var(--text-tertiary)] leading-relaxed">
                                            Ignore AI suggestions and go directly to the goals dashboard to plan manually.
                                        </span>
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {!isLoading && report && view === 'semi-auto' && (
                        <motion.div key="semi-auto" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="w-full space-y-6">
                            <div className="flex items-center gap-4 mb-6">
                                <button onClick={() => setView('report')} className="p-2 bg-[var(--glass-bg)] rounded-xl border border-[var(--glass-border)] text-[var(--text-secondary)] hover:text-white transition-colors">
                                    <ArrowLeft className="w-4 h-4" />
                                </button>
                                <h2 className="text-2xl font-bold">Review Goal Changes</h2>
                            </div>

                            <div className="space-y-4">
                                {report.data.proposed_goal_changes.map(change => {
                                    const isApproved = approvedChanges.has(change.goal_id);
                                    return (
                                        <div 
                                            key={change.goal_id}
                                            onClick={() => toggleChange(change.goal_id)}
                                            className={`p-5 rounded-2xl border cursor-pointer transition-all ${
                                                isApproved 
                                                    ? 'bg-[var(--glass-bg)] border-[var(--color-primary)]/50 shadow-lg shadow-[var(--color-primary)]/10' 
                                                    : 'bg-[var(--glass-bg)]/50 border-[var(--glass-border)] opacity-60'
                                            }`}
                                        >
                                            <div className="flex items-start gap-4">
                                                <div className="mt-1">
                                                    {isApproved ? (
                                                        <CheckCircle2 className="w-5 h-5 text-[var(--color-primary)]" />
                                                    ) : (
                                                        <Circle className="w-5 h-5 text-[var(--text-tertiary)]" />
                                                    )}
                                                </div>
                                                <div className="flex-1">
                                                    <h4 className="font-bold text-[var(--text-primary)] mb-1 flex items-center gap-2">
                                                        {change.title}
                                                        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--glass-bg)] border border-[var(--glass-border)]">
                                                            {change.change_type.replace('_', ' ')}
                                                        </span>
                                                    </h4>
                                                    <div className="flex items-center gap-3 text-sm font-medium my-3 p-3 bg-black/20 rounded-xl">
                                                        <span className="text-[var(--text-tertiary)] line-through">{change.old_value}</span>
                                                        <ArrowRight className="w-4 h-4 text-[var(--color-primary)]" />
                                                        <span className="text-[var(--text-primary)]">{change.new_value}</span>
                                                    </div>
                                                    <p className="text-sm text-[var(--text-secondary)] italic">
                                                        <ArrowDownRight className="inline w-3 h-3 mr-1 text-[var(--text-tertiary)]" />
                                                        {change.rationale}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>

                            <div className="pt-6">
                                <button
                                    onClick={applySemiAuto}
                                    disabled={isExecuting}
                                    className="w-full py-4 rounded-xl font-bold bg-[var(--color-primary)] text-white hover:brightness-110 flex items-center justify-center gap-2 disabled:opacity-50 transition-all shadow-lg shadow-[var(--color-primary)]/20"
                                >
                                    {isExecuting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Target className="w-5 h-5" />}
                                    Apply {approvedChanges.size} {approvedChanges.size === 1 ? 'Change' : 'Changes'}
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {!isLoading && view === 'done' && (
                        <motion.div key="done" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center justify-center py-20 text-center space-y-6">
                            <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center">
                                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                            </div>
                            <h2 className="text-3xl font-bold">You're All Set!</h2>
                            <p className="text-[var(--text-secondary)]">Your goals and priorities have been updated for the new week. Let's make it count.</p>
                            <button
                                onClick={exitReview}
                                className="px-8 py-3 rounded-xl bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm font-bold transition-all mt-4"
                            >
                                Back to Dashboard
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
