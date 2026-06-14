import { ScheduleBlock } from '@/types/database';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { Plus, Clock, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface ProactiveInboxProps {
    items: ScheduleBlock[];
    onAutoPlace: (id: string, duration: number) => Promise<void>;
    isOptimizing: boolean;
}

export function ProactiveInbox({ items, onAutoPlace, isOptimizing }: ProactiveInboxProps) {
    const [placingId, setPlacingId] = useState<string | null>(null);

    const handlePlace = async (id: string, duration: number) => {
        setPlacingId(id);
        await onAutoPlace(id, duration);
        setPlacingId(null);
    };

    return (
        <div className="flex flex-col h-full bg-black/40 backdrop-blur-xl border-l border-white/5 relative">
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <div>
                    <h2 className="text-sm font-bold text-white flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-emerald-400" />
                        Proactive Inbox
                    </h2>
                    <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">Waiting to be scheduled</p>
                </div>
                <div className="px-2 py-1 rounded-full bg-white/5 text-xs text-white/60 font-medium">
                    {items.length} left
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar relative">
                {items.length === 0 ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 text-white/30">
                        <Sparkles className="w-8 h-8 mb-3 opacity-20" />
                        <p className="text-sm">Inbox is perfectly clean.</p>
                    </div>
                ) : (
                    <AnimatePresence>
                        {items.map(item => {
                            const meta = item.meta as any;
                            const estMins = meta?.estimated_minutes || 30;
                            const isPlacing = placingId === item.id;

                            return (
                                <motion.div
                                    key={item.id}
                                    layout
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className="p-3 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition-colors group"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-sm font-medium text-white truncate">{item.title}</h3>
                                            <div className="flex items-center gap-2 mt-1.5">
                                                <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-white/40">
                                                    <Clock className="w-3 h-3" />
                                                    {estMins}m
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-3 pt-3 border-t border-white/5">
                                        <button
                                            onClick={() => handlePlace(item.id, estMins as number)}
                                            disabled={isPlacing || isOptimizing}
                                            className="w-full py-2 flex items-center justify-center gap-1.5 rounded-lg
                                                     bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 
                                                     text-xs font-bold transition-colors disabled:opacity-50"
                                        >
                                            {isPlacing ? (
                                                <span className="animate-pulse">Placing...</span>
                                            ) : (
                                                <>
                                                    <Sparkles className="w-3.5 h-3.5" />
                                                    Auto-Schedule
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                )}
            </div>
        </div>
    );
}
