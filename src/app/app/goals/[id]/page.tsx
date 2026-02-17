
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Goal } from '@/types/database';
import { GlassCard } from '@/components/ui/glass-card';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, Brain, CheckCircle2, Calendar, Target } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { motion } from 'framer-motion';

export default function GoalMissionControl() {
    const { id } = useParams();
    const router = useRouter();
    const [goal, setGoal] = useState<Goal | null>(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [plan, setPlan] = useState<any>(null); // TODO: Type this properly

    const [approving, setApproving] = useState(false);

    useEffect(() => {
        fetchGoal();
    }, [id]);

    const fetchGoal = async () => {
        const supabase = createClient();
        const { data, error } = await supabase
            .from('goals')
            .select('*')
            .eq('id', id)
            .single();

        if (data) {
            setGoal(data);
            if (data.ai_plan) {
                setPlan(data.ai_plan);
            }
        }
        setLoading(false);
    };

    const handleDecompose = async () => {
        if (!goal) return;
        setGenerating(true);
        try {
            const res = await apiClient.post<any>('/api/goals/decompose', {
                goal_title: goal.title,
                goal_description: goal.description,
                timeline: '3 months' // Todo: Make dynamic
            });

            if (res.plan) {
                setPlan(res.plan);
                // Save to DB immediately as draft
                const supabase = createClient();
                await supabase.from('goals').update({ ai_plan: res.plan }).eq('id', goal.id);
            } else {
                console.warn('No plan in response:', res);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setGenerating(false);
        }
    };

    const handleApprove = async () => {
        if (!goal || !plan) return;
        setApproving(true);
        try {
            await apiClient.post('/api/goals/execute', {
                goal_id: goal.id,
                plan: plan
            });
            // Redirect to main goals page or show success
            router.push('/app/goals');
        } catch (e) {
            console.error('Approval failed:', e);
            // Optional: Show error toast
        } finally {
            setApproving(false);
        }
    };

    if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>;
    if (!goal) return <div>Goal not found</div>;

    return (
        <div className="min-h-screen bg-[var(--bg-primary)] p-4 md:p-8 space-y-8">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => router.back()}>
                    <ArrowLeft className="w-5 h-5" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Target className="w-6 h-6 text-[var(--color-primary)]" />
                        {goal.title}
                    </h1>
                    <p className="text-[var(--text-secondary)]">Mission Control</p>
                </div>
            </div>

            {/* Strategic Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <GlassCard className="p-6 col-span-2">
                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <Brain className="w-4 h-4 text-purple-400" />
                        Execute Strategy
                    </h2>

                    {!plan ? (
                        <div className="text-center py-12 space-y-4">
                            <p className="text-[var(--text-secondary)]">No execution plan detected.</p>
                            <Button
                                onClick={handleDecompose}
                                disabled={generating}
                                className="bg-purple-600 hover:bg-purple-700 text-white"
                            >
                                {generating ? (
                                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing...</>
                                ) : (
                                    <><Brain className="w-4 h-4 mr-2" /> Decompose with AI</>
                                )}
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="grid grid-cols-3 gap-4 mb-6">
                                <div className="bg-white/5 p-3 rounded-lg text-center">
                                    <div className="text-xs text-[var(--text-tertiary)] uppercase">Complexity</div>
                                    <div className="font-bold text-lg capitalize">{plan.analysis.complexity}</div>
                                </div>
                                <div className="bg-white/5 p-3 rounded-lg text-center">
                                    <div className="text-xs text-[var(--text-tertiary)] uppercase">Timeline</div>
                                    <div className="font-bold text-lg">{plan.analysis.time_horizon}</div>
                                </div>
                                <div className="bg-white/5 p-3 rounded-lg text-center">
                                    <div className="text-xs text-[var(--text-tertiary)] uppercase">Milestones</div>
                                    <div className="font-bold text-lg">{plan.milestones.length}</div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                {plan.milestones.map((m: any, idx: number) => (
                                    <div key={idx} className="border border-white/10 rounded-xl p-4 bg-black/20">
                                        <div className="flex items-center justify-between mb-2">
                                            <h3 className="font-bold text-white">{m.title}</h3>
                                            <span className="text-xs bg-white/10 px-2 py-1 rounded">T+{m.deadline_offset_days} days</span>
                                        </div>
                                        <p className="text-sm text-[var(--text-secondary)] mb-4">{m.description}</p>

                                        <div className="space-y-2">
                                            {m.tasks.map((t: any, tIdx: number) => (
                                                <div key={tIdx} className="flex items-center gap-3 text-sm bg-white/5 p-2 rounded hover:bg-white/10 transition-colors">
                                                    <div className="w-4 h-4 rounded-full border border-white/20" />
                                                    <span className="flex-1">{t.title}</span>
                                                    <span className="text-xs text-[var(--text-tertiary)] flex items-center gap-1">
                                                        <Calendar className="w-3 h-3" />
                                                        {t.estimated_minutes}m
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="flex justify-end gap-2 pt-4 border-t border-white/10">
                                <Button variant="outline" onClick={handleDecompose} disabled={generating || approving}>
                                    Regenerate
                                </Button>
                                <Button
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                    onClick={handleApprove}
                                    disabled={approving}
                                >
                                    {approving ? (
                                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Approving...</>
                                    ) : (
                                        "Approve Plan"
                                    )}
                                </Button>
                            </div>
                        </div>
                    )}
                </GlassCard>

                {/* Sidebar Info */}
                <div className="space-y-6">
                    <GlassCard className="p-4">
                        <h3 className="text-sm font-semibold mb-2">Goal Details</h3>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-[var(--text-tertiary)]">Pillar</span>
                                <span>{goal.pillar}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-[var(--text-tertiary)]">Priority</span>
                                <span className="capitalize">{goal.priority}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-[var(--text-tertiary)]">Deadline</span>
                                <span>--</span>
                            </div>
                        </div>
                    </GlassCard>
                </div>
            </div>
        </div>
    );
}
