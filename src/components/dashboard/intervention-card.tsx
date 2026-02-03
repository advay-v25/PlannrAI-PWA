
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { Sparkles, X, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { InterventionLog } from '@/types/database';
import { createClient } from '@/lib/supabase/client';

interface InterventionCardProps {
    intervention: InterventionLog;
    onDismiss: () => void;
}

export function InterventionCard({ intervention, onDismiss }: InterventionCardProps) {
    const router = useRouter();
    const [dismissing, setDismissing] = useState(false);
    const supabase = createClient();

    const handleAction = async (action: 'accept' | 'dismiss') => {
        if (action === 'dismiss') setDismissing(true);

        // Update DB
        await supabase
            .from('intervention_logs')
            .update({
                status: action === 'accept' ? 'accepted' : 'dismissed',
                action_taken_at: new Date().toISOString()
            })
            .eq('id', intervention.id);

        if (action === 'dismiss') {
            setTimeout(onDismiss, 300);
        } else {
            // Navigate based on type
            if (intervention.type === 'stagnation') router.push('/app/goals');
            if (intervention.type === 'burnout') router.push('/app/coach');
            if (intervention.type === 'disengagement') router.push('/app/brain-dump');
        }
    };

    return (
        <AnimatePresence>
            {!dismissing && (
                <motion.div
                    initial={{ opacity: 0, y: -20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.4, ease: "backOut" }}
                    className="mb-8"
                >
                    <GlassCard
                        variant="glow"
                        padding="md"
                        className="relative overflow-hidden border-l-4 border-[var(--color-accent-mind)]"
                    >
                        {/* "Pulse" Background Effect */}
                        <div className="absolute -left-10 -top-10 w-32 h-32 bg-[var(--color-accent-mind)] opacity-10 blur-3xl animate-pulse" />

                        <div className="relative flex flex-col sm:flex-row items-center gap-4 justify-between">

                            {/* Icon & Message */}
                            <div className="flex items-center gap-4 text-center sm:text-left">
                                <div className="w-10 h-10 rounded-full bg-[var(--color-primary)]/20 flex items-center justify-center shrink-0">
                                    <Sparkles className="w-5 h-5 text-[var(--color-primary)]" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-1">
                                        Neural OS Insight
                                    </p>
                                    <p className="font-medium text-lg text-[var(--text-primary)] leading-tight">
                                        "{intervention.message}"
                                    </p>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                                <GlassButton
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleAction('dismiss')}
                                    className="flex-1 sm:flex-none border border-[var(--glass-border)]"
                                >
                                    <X className="w-4 h-4 text-[var(--text-tertiary)]" />
                                    <span className="sr-only">Dismiss</span>
                                </GlassButton>
                                <GlassButton
                                    size="sm"
                                    variant="primary"
                                    onClick={() => handleAction('accept')}
                                    className="flex-1 sm:flex-none whitespace-nowrap"
                                >
                                    Let's Discuss <ArrowRight className="w-3 h-3 ml-2" />
                                </GlassButton>
                            </div>
                        </div>
                    </GlassCard>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
