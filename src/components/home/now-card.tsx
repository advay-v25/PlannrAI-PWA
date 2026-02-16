'use client';

import { motion } from 'framer-motion';
import { Play, CheckSquare, SkipForward, RefreshCw, Clock, ArrowRight } from 'lucide-react';
import { format, differenceInMinutes } from 'date-fns';
import { cn } from '@/lib/utils';
import { useCoach } from '@/hooks/use-coach';

interface NowCardProps {
    block: any;
    onAction: () => void;
}

export function NowCard({ block, onAction }: NowCardProps) {
    const { sendMessage } = useCoach();

    if (!block) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 p-8 text-center backdrop-blur-xl"
            >
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5" />
                <h3 className="relative z-10 text-lg font-medium text-white/40">Intentionally light.</h3>
                <button
                    onClick={() => sendMessage("I want to add something for now.")}
                    className="relative z-10 mt-4 rounded-full bg-white/10 px-6 py-2 text-xs font-bold text-white transition-colors hover:bg-white/20"
                >
                    + Add Quick Block
                </button>
            </motion.div>
        );
    }

    const isCurrent = block.reason === 'Now';
    const timeLeft = differenceInMinutes(new Date(`${new Date().toISOString().split('T')[0]}T${block.end_time}`), new Date());

    const handleAction = async (action: 'done' | 'skip' | 'rework') => {
        // Implement action logic (API calls) here or pass up
        // For MVP, we'll just log and trigger refresh
        console.log('Action:', action, block.id);

        if (action === 'rework') {
            sendMessage(`I need to rework the block "${block.title}".`);
            return;
        }

        // Optimistic UI update could happen here
        try {
            // await api call
            onAction();
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="group relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-white/10 to-white/5 p-8 shadow-2xl backdrop-blur-2xl border border-white/10"
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
                    isCurrent ? "bg-[var(--color-primary)] text-white" : "bg-white/10 text-white/60"
                )}>
                    {isCurrent && <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />}
                    {block.reason || 'UP NEXT'}
                </div>
                {isCurrent && (
                    <div className="font-mono text-xs text-white/40">
                        {timeLeft}m remaining
                    </div>
                )}
            </div>

            {/* Main Content */}
            <div className="mt-6 mb-8">
                <h2 className="text-4xl font-light tracking-tight text-white mb-2">
                    {block.title}
                </h2>
                <div className="flex items-center gap-4 text-sm text-white/50">
                    <span className="font-mono">
                        {block.start_time.slice(0, 5)} - {block.end_time.slice(0, 5)}
                    </span>
                    {block.goal?.title && (
                        <>
                            <span className="h-1 w-1 rounded-full bg-white/20" />
                            <span>{block.goal.title}</span>
                        </>
                    )}
                </div>
            </div>

            {/* Actions Grid */}
            <div className="grid grid-cols-3 gap-3">
                <button
                    onClick={() => handleAction('done')}
                    className="group/btn relative flex flex-col items-center justify-center gap-2 rounded-2xl bg-white/5 py-4 transition-all hover:bg-[var(--color-primary)]/20 hover:scale-[1.02]"
                >
                    <div className="rounded-full bg-white/10 p-2 text-white transition-colors group-hover/btn:bg-emerald-500">
                        <CheckSquare className="h-5 w-5" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/60 group-hover/btn:text-white">Done</span>
                </button>

                <button
                    onClick={() => handleAction('rework')}
                    className="group/btn relative flex flex-col items-center justify-center gap-2 rounded-2xl bg-white/5 py-4 transition-all hover:bg-white/10 hover:scale-[1.02]"
                >
                    <div className="rounded-full bg-white/10 p-2 text-white transition-colors group-hover/btn:bg-blue-500">
                        <RefreshCw className="h-5 w-5" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/60 group-hover/btn:text-white">Rework</span>
                </button>

                <button
                    onClick={() => handleAction('skip')}
                    className="group/btn relative flex flex-col items-center justify-center gap-2 rounded-2xl bg-white/5 py-4 transition-all hover:bg-white/10 hover:scale-[1.02]"
                >
                    <div className="rounded-full bg-white/10 p-2 text-white transition-colors group-hover/btn:bg-amber-500">
                        <SkipForward className="h-5 w-5" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/60 group-hover/btn:text-white">Skip</span>
                </button>
            </div>

        </motion.div>
    );
}
