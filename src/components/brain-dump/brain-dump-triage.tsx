'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { ArrowRight, Check, CheckCircle2, ListTodo, Lightbulb, Heart, Calendar } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface BrainDumpTriageProps {
    data: any; // BrainDumpOutputSchema
    onComplete: () => void;
    onCancel: () => void;
}

export function BrainDumpTriage({ data, onComplete, onCancel }: BrainDumpTriageProps) {
    const [status, setStatus] = useState<'review' | 'processing' | 'done'>('review');

    const intentIcon = {
        execution: <ListTodo className="w-5 h-5 text-blue-400" />,
        planning: <Calendar className="w-5 h-5 text-purple-400" />,
        journaling: <Heart className="w-5 h-5 text-pink-400" />,
        ideation: <Lightbulb className="w-5 h-5 text-yellow-400" />
    }[data.intent as string] || <ListTodo className="w-5 h-5" />;

    const handleAction = async () => {
        setStatus('processing');
        try {
            if (data.strategy.recommended_action === 'schedule_tasks' && data.extracted.tasks) {
                // Convert tasks to patch ops if not already present
                // Ideally the AI provides a patch, but if not we can call the scheduler.
                // For now, let's assume if there are tasks we might want auto-schedule.

                if (data.patch) {
                    await apiClient.patch.apply(data.patch, 'brain_dump_triage');
                } else {
                    // Auto-schedule logic would go here or we just save them to inbox
                    // For MVP, just save to goals/inbox?
                    // Let's just finish for now.
                }
            }
            // Other actions...
            setStatus('done');
            setTimeout(onComplete, 1000);
        } catch (e) {
            console.error(e);
            setStatus('review');
        }
    };

    if (status === 'done') {
        return (
            <GlassCard padding="lg" className="text-center animate-in fade-in zoom-in duration-300">
                <div className="w-16 h-16 mx-auto rounded-full bg-green-500/20 flex items-center justify-center mb-4">
                    <CheckCircle2 className="w-8 h-8 text-green-500" />
                </div>
                <h3 className="text-lg font-bold">All Sorted!</h3>
                <p className="text-sm text-[var(--text-secondary)]">Your mind is clearer now.</p>
            </GlassCard>
        );
    }

    return (
        <GlassCard padding="md" className="space-y-4 border-l-4 border-[var(--color-primary)]">
            {/* Header */}
            <div className="flex items-center gap-3 pb-3 border-b border-[var(--glass-border)]">
                <div className="p-2 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)]">
                    {intentIcon}
                </div>
                <div>
                    <h3 className="font-bold text-sm capitalize">{data.intent} Detected</h3>
                    <p className="text-xs text-[var(--text-tertiary)]">{data.strategy.summary}</p>
                </div>
            </div>

            {/* Extracted Items */}
            <div className="space-y-2">
                {data.extracted.tasks?.length > 0 && (
                    <div className="bg-[var(--glass-bg)] rounded-lg p-3">
                        <p className="text-xs font-bold text-[var(--text-secondary)] mb-2 uppercase tracking-wider">
                            Tasks to Add
                        </p>
                        <ul className="space-y-2">
                            {data.extracted.tasks.map((task: any, i: number) => (
                                <li key={i} className="flex items-center gap-2 text-sm">
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                                    <span className="flex-1">{task.title}</span>
                                    <span className="text-xs text-[var(--text-tertiary)]">{task.estimated_minutes}m</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {data.extracted.ideas?.length > 0 && (
                    <div className="bg-[var(--glass-bg)] rounded-lg p-3">
                        <p className="text-xs font-bold text-[var(--text-secondary)] mb-2 uppercase tracking-wider">
                            Ideas Captured
                        </p>
                        <ul className="space-y-1">
                            {data.extracted.ideas.map((idea: string, i: number) => (
                                <li key={i} className="text-sm text-[var(--text-secondary)]">• {idea}</li>
                            ))}
                        </ul>
                    </div>
                )}

                {data.extracted.emotional_signals && (
                    <div className="flex gap-2">
                        {data.extracted.emotional_signals.tags.map((tag: string) => (
                            <span key={tag} className="px-2 py-1 rounded-full bg-pink-500/10 text-pink-300 text-xs border border-pink-500/20">
                                {tag}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Action Area */}
            <div className="flex items-center gap-3 pt-2">
                <GlassButton variant="ghost" onClick={onCancel} className="flex-1 text-xs">
                    Dismiss
                </GlassButton>

                <GlassButton variant="primary" onClick={handleAction} className="flex-[2]" disabled={status === 'processing'}>
                    {status === 'processing' ? 'Processing...' : (
                        <>
                            {data.strategy.recommended_action === 'schedule_tasks' && "Schedule Tasks"}
                            {data.strategy.recommended_action === 'plan_week' && "Open Planner"}
                            {data.strategy.recommended_action === 'save_notes' && "Save Notes"}
                            {data.strategy.recommended_action === 'coaching_session' && "Start Chat"}
                            {data.strategy.recommended_action === 'nothing' && "Done"}
                            {!['schedule_tasks', 'plan_week', 'save_notes', 'coaching_session', 'nothing'].includes(data.strategy.recommended_action) && "Proceed"}
                            <ArrowRight className="w-4 h-4 ml-2" />
                        </>
                    )}
                </GlassButton>
            </div>
        </GlassCard>
    );
}
