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
            {/* SVG organic ribbon flows — orange palette, visible outside the card */}
            <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none', overflow: 'hidden' }}>
              {/* Top accent line */}
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
                background: 'linear-gradient(to right, transparent, hsla(22,100%,60%,0.55) 35%, hsla(14,100%,55%,0.40) 60%, transparent)',
              }} />
              <svg
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                viewBox="0 0 1440 900"
                preserveAspectRatio="xMidYMid slice"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  <linearGradient id="tasks-r1" x1="1440" y1="-100" x2="0" y2="900" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="hsla(22,100%,60%,0.40)" />
                    <stop offset="40%" stopColor="hsla(16,100%,44%,0.20)" />
                    <stop offset="100%" stopColor="hsla(10,90%,18%,0)" />
                  </linearGradient>
                  <linearGradient id="tasks-r2" x1="1440" y1="200" x2="200" y2="900" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="hsla(35,95%,55%,0.22)" />
                    <stop offset="55%" stopColor="hsla(22,100%,50%,0.10)" />
                    <stop offset="100%" stopColor="transparent" />
                  </linearGradient>
                  <linearGradient id="tasks-r3" x1="1" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsla(22,100%,56%,0.18)" />
                    <stop offset="100%" stopColor="transparent" />
                  </linearGradient>
                  <filter id="tasks-shadow" x="-60%" y="-60%" width="220%" height="220%">
                    <feGaussianBlur stdDeviation="30" />
                  </filter>
                  <filter id="tasks-glow" x="-60%" y="-60%" width="220%" height="220%">
                    <feGaussianBlur stdDeviation="10" />
                  </filter>
                </defs>

                {/* FOLD 1 — main lit face, top-right sweeping to lower-left */}
                <path
                  d="M 1600 -200 C 1300 20 1050 200 820 390 C 590 580 370 720 0 890 L 0 1000 L 1600 1000 Z"
                  fill="url(#tasks-r1)"
                />
                {/* FOLD 1 — valley shadow (dark blurred crease) */}
                <path
                  d="M 1430 -60 C 1130 170 890 350 670 530 C 450 710 240 830 -80 920"
                  stroke="hsla(10,60%,5%,0.55)"
                  strokeWidth="100"
                  fill="none"
                  filter="url(#tasks-shadow)"
                />
                {/* FOLD 1 — bright ridge highlight */}
                <path
                  d="M 1430 -60 C 1130 170 890 350 670 530 C 450 710 240 830 -80 920"
                  stroke="hsla(30,100%,76%,0.55)"
                  strokeWidth="1.5"
                  fill="none"
                />
                {/* FOLD 1 — soft glow halo */}
                <path
                  d="M 1430 -60 C 1130 170 890 350 670 530 C 450 710 240 830 -80 920"
                  stroke="hsla(22,100%,65%,0.28)"
                  strokeWidth="38"
                  fill="none"
                  filter="url(#tasks-glow)"
                />

                {/* FOLD 2 — secondary ribbon face */}
                <path
                  d="M 1600 160 C 1300 360 1050 510 820 660 C 590 810 370 890 0 980 L 0 1000 L 1600 1000 Z"
                  fill="url(#tasks-r2)"
                />
                {/* FOLD 2 — bright ridge highlight */}
                <path
                  d="M 1430 220 C 1130 420 890 570 670 710 C 450 850 240 930 -80 1000"
                  stroke="hsla(30,100%,68%,0.32)"
                  strokeWidth="1.5"
                  fill="none"
                />
                {/* FOLD 2 — soft glow halo */}
                <path
                  d="M 1430 220 C 1130 420 890 570 670 710 C 450 850 240 930 -80 1000"
                  stroke="hsla(22,100%,62%,0.18)"
                  strokeWidth="32"
                  fill="none"
                  filter="url(#tasks-glow)"
                />

                {/* Upper-right corner fill accent */}
                <path
                  d="M 1600 -350 C 1500 -180 1350 -70 1200 40 C 1050 150 950 230 820 340 L 1600 340 Z"
                  fill="url(#tasks-r3)"
                />
              </svg>
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
                    className="flex-1 rounded-[2rem] border border-white/8 overflow-hidden"
                    style={{ backgroundColor: 'hsl(222,50%,4%)' }}
                >
                    <div className="h-full w-full">
                        <ActionCenter />
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
