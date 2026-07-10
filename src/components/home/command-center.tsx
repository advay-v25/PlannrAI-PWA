'use client';

import { motion } from 'framer-motion';
import { Check, Edit2, Play, AlertCircle, RefreshCw, X, Brain, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';

interface CommandCenterProps {
    userName?: string;
    plannedMinutes: number;
    unscheduledMinutes: number;
    overdueCount: number;
    state: string; // 'IN_BLOCK', 'BEHIND_SCHEDULE', 'NO_SCHEDULE', etc.
    activeBlock: any;
    nextBlock: any;
    timeRemaining: number | null;
    timeUntilNext: number | null;
    onAction: (action: string, payload?: any) => void;
    isLoading?: boolean;
}

function formatDuration(minutes: number) {
    if (minutes < 60) return `${Math.floor(minutes)}m`;
    const h = Math.floor(minutes / 60);
    const m = Math.floor(minutes % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function getGreeting(name: string = "") {
    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    return name ? `${timeOfDay}, ${name.split(' ')[0]}` : timeOfDay;
}

export function CommandCenter({
    userName,
    plannedMinutes,
    unscheduledMinutes,
    overdueCount,
    state,
    activeBlock,
    nextBlock,
    timeRemaining,
    timeUntilNext,
    onAction,
    isLoading
}: CommandCenterProps) {

    if (isLoading) {
        return (
            <div className="h-[40vh] flex flex-col justify-center animate-pulse">
                <div className="w-48 h-8 bg-[var(--glass-bg)] rounded-lg mb-4" />
                <div className="w-64 h-4 bg-[var(--glass-bg)] rounded-lg mb-2" />
                <div className="w-32 h-4 bg-[var(--glass-bg)] rounded-lg mb-12" />
            </div>
        );
    }

    // Determine the next event text
    let nextEventText = null;
    if (activeBlock) {
        const remainingStr = timeRemaining != null && !isNaN(timeRemaining) ? ` (${Math.round(timeRemaining)}m remaining)` : '';
        nextEventText = `Currently: ${activeBlock.title}${remainingStr}`;
    } else if (nextBlock) {
        const untilNextStr = timeUntilNext != null && !isNaN(timeUntilNext) ? ` in ${Math.round(timeUntilNext)} min` : '';
        nextEventText = `Next: ${nextBlock.title}${untilNextStr}`;
    } else if (state === 'NO_SCHEDULE') {
        nextEventText = "Your schedule is empty. Time to plan.";
    } else {
        nextEventText = "You've finished your scheduled blocks for today!";
    }

    return (
        <div className="flex flex-col justify-center pt-8 pb-4">
            <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8"
            >
                <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-[var(--text-primary)] mb-6">
                    {getGreeting(userName)}
                </h1>
                
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 text-sm text-[var(--text-secondary)] font-medium mb-10">
                    <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-[var(--color-primary)] shadow-[0_0_8px_var(--color-primary-glow)]" />
                        <span>{formatDuration(plannedMinutes)} planned</span>
                    </div>
                    {overdueCount > 0 && (
                        <div className="flex items-center gap-2 text-red-400">
                            <div className="w-2.5 h-2.5 rounded-full bg-red-400 animate-pulse shadow-[0_0_8px_rgba(248,113,113,0.6)]" />
                            <span>{overdueCount} tasks overdue</span>
                        </div>
                    )}
                </div>

                <div className="p-5 rounded-2xl bg-[var(--glass-bg)] border border-[var(--glass-border)] w-full mb-6 shadow-[var(--shadow-md)] flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <span className="text-xl font-medium text-[var(--text-primary)]">
                            {nextEventText}
                        </span>
                        {activeBlock && (
                            <div className="flex items-center gap-3">
                                <button 
                                    onClick={() => onAction('mark_done', activeBlock)}
                                    className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors"
                                    title="Mark as Done"
                                >
                                    <Check size={20} />
                                </button>
                                <button 
                                    onClick={() => onAction('mark_incomplete', activeBlock)}
                                    className="p-2.5 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
                                    title="Mark Incomplete"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Actions & Recent Capture */}
                <div className="flex flex-col xl:flex-row items-stretch gap-4 w-full">
                    <button 
                        onClick={() => onAction('generate_schedule')}
                        className="flex-none flex items-center justify-center gap-2 bg-gradient-to-br from-[var(--color-primary)] to-orange-600 hover:scale-[1.02] active:scale-[0.98] text-white border border-white/10 px-6 py-4 rounded-2xl text-sm font-bold shadow-[0_0_20px_var(--color-primary-glow)] transition-all"
                    >
                        Plan My Day
                    </button>
                    
                    <button 
                        onClick={() => onAction('next_move')}
                        className="flex-none flex items-center justify-center gap-2 px-6 py-4 rounded-2xl text-sm font-bold border border-white/10 bg-white/5 hover:bg-white/10 text-white/90 hover:text-white hover:scale-[1.02] active:scale-[0.98] transition-all shadow-sm"
                    >
                        Need help?
                    </button>

                    {/* Up Next Block */}
                    <div className="flex-1 group min-w-0">
                        <Link href="/app/calendar" className="block relative h-full flex items-center justify-between gap-3 px-5 py-3 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all shadow-sm overflow-hidden group-hover:border-white/20">
                            <div className="absolute inset-0 opacity-10 group-hover:opacity-30 bg-gradient-to-r from-blue-500/20 via-purple-500/10 to-transparent transition-opacity duration-500" />
                            
                            <div className="relative flex items-center gap-4 min-w-0 w-full">
                                <div className="w-10 h-10 rounded-xl bg-black/20 flex flex-shrink-0 items-center justify-center border border-white/5 group-hover:scale-105 group-hover:bg-black/30 transition-all duration-300">
                                    <CalendarIcon className="w-5 h-5 text-blue-400 group-hover:text-blue-300" />
                                </div>
                                <div className="flex flex-col min-w-0 flex-1 justify-center">
                                    <span className="text-[10px] leading-tight font-bold uppercase tracking-widest text-white/40 mb-1">
                                        Up Next
                                    </span>
                                    <span className="text-sm leading-tight font-semibold text-white/90 truncate group-hover:text-white transition-colors">
                                        {nextBlock ? nextBlock.title : "No upcoming events"}
                                    </span>
                                </div>
                                {nextBlock && nextBlock.start_time && (
                                    <div className="hidden sm:flex px-4 py-1.5 rounded-full bg-black/20 border border-white/5 text-[10px] font-bold text-white/50 uppercase tracking-widest group-hover:bg-black/40 group-hover:text-white transition-all flex-shrink-0">
                                        {format(new Date(`2000-01-01T${nextBlock.start_time}`), 'h:mm a')}
                                    </div>
                                )}
                                {!nextBlock && (
                                    <div className="hidden sm:flex px-4 py-1.5 rounded-full bg-black/20 border border-white/5 text-[10px] font-bold text-white/50 uppercase tracking-widest group-hover:bg-black/40 group-hover:text-white transition-all flex-shrink-0">
                                        View Calendar
                                    </div>
                                )}
                            </div>
                        </Link>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
