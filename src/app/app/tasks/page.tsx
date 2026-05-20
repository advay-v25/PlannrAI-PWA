'use client';

import { ActionCenter } from '@/components/todos/ActionCenter';
import { useTodos } from '@/hooks/use-todos';
import { motion } from 'framer-motion';
import { PageBackground } from '@/components/ui/PageBackground';

function AllTimeProgress() {
    const { todos, isLoading } = useTodos();
    
    if (isLoading || todos.length === 0) return null;
    
    const completed = todos.filter(t => t.is_completed).length;
    const total = todos.length;
    const pct = Math.round((completed / total) * 100);
    
    return (
        <motion.div 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="hidden lg:flex flex-col items-center gap-3 w-12 shrink-0 pt-8"
        >
            {/* Vertical progress bar container */}
            <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest writing-mode-vertical"
                style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', transform: 'rotate(180deg)' }}
            >
                Progress
            </span>
            
            <div className="flex-1 w-1.5 bg-white/[0.04] rounded-full overflow-hidden relative min-h-[120px]">
                <motion.div 
                    initial={{ height: 0 }}
                    animate={{ height: `${pct}%` }}
                    transition={{ duration: 1, ease: 'easeOut', delay: 0.5 }}
                    className="absolute bottom-0 left-0 right-0 rounded-full"
                    style={{
                        background: 'linear-gradient(to top, #F97316, #EF4444, #F97316)',
                    }}
                />
            </div>
            
            <div className="flex flex-col items-center gap-0.5">
                <span className="text-xs font-bold text-white/70">{pct}%</span>
                <span className="text-[8px] text-white/25 font-medium">{completed}/{total}</span>
            </div>
        </motion.div>
    );
}

export default function TasksPage() {
    return (
        <div className="flex flex-col h-[calc(100vh-8rem)]">
            <PageBackground color="orange" />
            <header className="mb-6">
                <h1 className="text-3xl font-bold tracking-tight text-white">Tasks</h1>
                <p className="text-[var(--text-secondary)] mt-1">
                    Keep Track of your Tasks and Deadlines Using a Customisable Board.
                </p>
            </header>

            <div className="flex-1 flex gap-3 min-h-0">
                {/* Left: All-time progress bar */}
                <AllTimeProgress />

                {/* Right: Main tasks area */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex-1 rounded-[2rem] border border-white/10 bg-[var(--glass-bg)] backdrop-blur-xl overflow-hidden"
                >
                    <div className="h-full w-full">
                        <ActionCenter />
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
