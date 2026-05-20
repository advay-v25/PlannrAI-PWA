'use client';

import { ActionCenter } from '@/components/todos/ActionCenter';
import { useTodos } from '@/hooks/use-todos';
import { motion } from 'framer-motion';

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
            {/* Background accents sit outside the card — visible in header + margins */}
            <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none', overflow: 'hidden' }}>
              {/* Orange glow — top-right, stays above the card */}
              <div style={{
                position: 'absolute', top: '-8%', right: '-8%',
                width: '48vw', height: '55vh',
                background: 'radial-gradient(ellipse 62% 52% at 72% 22%, hsla(22, 100%, 60%, 0.22) 0%, hsla(14, 100%, 44%, 0.12) 42%, transparent 68%)',
                filter: 'blur(55px)',
              }} />
              {/* Warm secondary — bottom-left corner */}
              <div style={{
                position: 'absolute', bottom: '10%', left: '-10%',
                width: '35vw', height: '40vh',
                background: 'radial-gradient(ellipse at 28% 75%, hsla(22, 100%, 55%, 0.10) 0%, transparent 65%)',
                filter: 'blur(50px)',
              }} />
              {/* Top accent line */}
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
                background: 'linear-gradient(to right, transparent, hsla(22, 100%, 60%, 0.55) 35%, hsla(14, 100%, 55%, 0.40) 60%, transparent)',
              }} />
            </div>

            <header className="mb-6 relative">
              {/* Orange underline accent on title */}
              <div style={{
                position: 'absolute', bottom: '-10px', left: 0,
                width: '80px', height: '1px',
                background: 'linear-gradient(to right, hsla(22, 100%, 60%, 0.7), transparent)',
              }} />
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
