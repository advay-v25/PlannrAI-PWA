'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Target, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

interface PrioritiesCardProps {
    priorities: string[];
    tone?: string;
}

export function PrioritiesCard({ priorities, tone }: PrioritiesCardProps) {
    const [checked, setChecked] = useState<Set<number>>(new Set());
    const router = useRouter();

    const handleClick = (index: number, text: string) => {
        if (text.toLowerCase().includes('objective') || text.toLowerCase().includes('goal')) {
            router.push('/app/goals');
            return;
        }
        setChecked(prev => {
            const next = new Set(prev);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });
    };

    if (!priorities || priorities.length === 0) return null;

    const toneColors: Record<string, string> = {
        focused: 'from-blue-500/15 to-cyan-500/5',
        energized: 'from-orange-500/15 to-yellow-500/5',
        gentle: 'from-green-500/15 to-emerald-500/5',
        urgent: 'from-red-500/15 to-pink-500/5'
    };

    const gradient = toneColors[tone || 'focused'] || toneColors.focused;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className={cn(
                "rounded-[2rem] border border-white/10 bg-gradient-to-br p-6 backdrop-blur-xl",
                gradient
            )}
        >
            <div className="flex items-center gap-2 mb-4">
                <div className="p-1.5 rounded-lg bg-white/10">
                    <Target className="w-4 h-4 text-[var(--color-primary)]" />
                </div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-white/60">
                    Today's Focus
                </h3>
            </div>

            <div className="space-y-2">
                {priorities.map((priority, i) => (
                    <motion.button
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 + i * 0.1 }}
                        onClick={() => handleClick(i, priority)}
                        className={cn(
                            "w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all",
                            checked.has(i)
                                ? "bg-white/5 opacity-50"
                                : "bg-white/10 hover:bg-white/15"
                        )}
                    >
                        <div className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all",
                            checked.has(i)
                                ? "border-[var(--color-primary)] bg-[var(--color-primary)]"
                                : "border-white/30"
                        )}>
                            {checked.has(i) && (
                                <CheckCircle2 className="h-3 w-3 text-white" />
                            )}
                        </div>
                        <span className={cn(
                            "text-sm font-medium transition-all",
                            checked.has(i) ? "text-white/40 line-through" : "text-white/90"
                        )}>
                            {priority}
                        </span>
                    </motion.button>
                ))}
            </div>

            {checked.size === priorities.length && priorities.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="mt-4 text-center text-xs font-bold text-[var(--color-primary)] uppercase tracking-widest"
                >
                    ✨ All priorities cleared
                </motion.div>
            )}
        </motion.div>
    );
}
