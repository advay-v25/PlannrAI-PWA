'use client';

import { motion } from 'framer-motion';
import { Play, CheckSquare, SkipForward, RefreshCw, Clock, ArrowRight } from 'lucide-react';
import { format, differenceInMinutes } from 'date-fns';
import { cn } from '@/lib/utils';
import { useCoach } from '@/hooks/use-coach';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';

interface NowCardProps {
    block: any;
    onAction: () => void;
}

export function NowCard({ block, onAction }: NowCardProps) {
    const { sendMessage } = useCoach();
    const { showToast } = useToast();

    if (!block) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative overflow-hidden rounded-[2rem] border border-[var(--glass-border)] bg-[var(--glass-bg)] p-8 text-center backdrop-blur-xl"
            >
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5" />
                <h3 className="relative z-10 text-lg font-medium text-[var(--text-secondary)]">Intentionally light.</h3>
                <button
                    onClick={() => sendMessage("I want to add something for now.")}
                    className="relative z-10 mt-4 rounded-full bg-[var(--glass-bg)] px-6 py-2 text-xs font-bold text-white transition-colors hover:bg-[var(--glass-bg)]"
                >
                    + Add Quick Block
                </button>
            </motion.div>
        );
    }

    const isCurrent = block.reason === 'Now';
    const timeLeft = differenceInMinutes(new Date(`${new Date().toISOString().split('T')[0]}T${block.end_time}`), new Date());

    const handleAction = async (action: 'done' | 'skip' | 'rework') => {
        console.log('Action:', action, block.id);

        if (action === 'rework') {
            sendMessage(`I need to rework the block "${block.title}".`);
            return;
        }

        try {
            if (action === 'done') {
                await apiClient.schedule.updateStatus(block.id, 'done');
                showToast('Block completed!', 'success');
            } else if (action === 'skip') {
                await apiClient.schedule.updateStatus(block.id, 'missed');
                showToast('Block skipped.', 'info');
            }
            onAction(); // Refund/Refresh home data
        } catch (e) {
            console.error(e);
            showToast('Failed to update block.', 'error');
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="group relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-white/10 to-white/5 p-8 shadow-2xl backdrop-blur-2xl border border-[var(--glass-border)]"
        >
            {/* Ambient Glow */}
            <div className={cn(
                "absolute -right-20 -top-20 h-64 w-64 rounded-full blur-[100px] transition-all duration-1000",
                isCurrent ? "bg-[var(--color-primary)]/20" : "bg-blue-500/10"
            )} />

            {/* Header Badge */}
            <div className="flex items-center justify-between">
                <div className={cn(
                    "flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest backdrop-blur-md",
                    isCurrent ? "bg-[var(--color-primary)] text-white" : "bg-[var(--glass-bg)] text-[var(--text-secondary)]"
                )}>
                    {isCurrent && <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />}
                    {block.reason || 'UP NEXT'}
                </div>
                {isCurrent && (
                    <div className="font-mono text-xs text-[var(--text-secondary)]">
                        {timeLeft}m remaining
                    </div>
                )}
            </div>

            {/* Main Content */}
            <div className="mt-6 mb-8">
                <h2 className="text-4xl font-light tracking-tight text-white mb-2">
                    {block.title}
                </h2>
                <div className="flex items-center gap-4 text-sm text-[var(--text-secondary)]">
                    <span className="font-mono">
                        {block.start_time.slice(0, 5)} - {block.end_time.slice(0, 5)}
                    </span>
                    {block.goal?.title && (
                        <>
                            <span className="h-1 w-1 rounded-full bg-[var(--glass-bg)]" />
                            <span>{block.goal.title}</span>
                        </>
                    )}
                </div>
            </div>

            {/* Actions Grid */}
            <div className="grid grid-cols-3 gap-3">
                <button
                    onClick={() => handleAction('done')}
                    className="group/btn relative flex flex-col items-center justify-center gap-2 rounded-2xl bg-[var(--glass-bg)] py-4 transition-all hover:bg-[var(--color-primary)]/20 hover:scale-[1.02]"
                >
                    <div className="rounded-full bg-[var(--glass-bg)] p-2 text-white transition-colors group-hover/btn:bg-emerald-500">
                        <CheckSquare className="h-5 w-5" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] group-hover/btn:text-white">Done</span>
                </button>

                <button
                    onClick={() => handleAction('rework')}
                    className="group/btn relative flex flex-col items-center justify-center gap-2 rounded-2xl bg-[var(--glass-bg)] py-4 transition-all hover:bg-[var(--glass-bg)] hover:scale-[1.02]"
                >
                    <div className="rounded-full bg-[var(--glass-bg)] p-2 text-white transition-colors group-hover/btn:bg-blue-500">
                        <RefreshCw className="h-5 w-5" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] group-hover/btn:text-white">Rework</span>
                </button>

                <button
                    onClick={() => handleAction('skip')}
                    className="group/btn relative flex flex-col items-center justify-center gap-2 rounded-2xl bg-[var(--glass-bg)] py-4 transition-all hover:bg-[var(--glass-bg)] hover:scale-[1.02]"
                >
                    <div className="rounded-full bg-[var(--glass-bg)] p-2 text-white transition-colors group-hover/btn:bg-amber-500">
                        <SkipForward className="h-5 w-5" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] group-hover/btn:text-white">Skip</span>
                </button>
            </div>

        </motion.div>
    );
}
