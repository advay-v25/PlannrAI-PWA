'use client';

import { MindspaceBoard } from '@/components/todos/MindspaceBoard';
import { motion } from 'framer-motion';

export default function TasksPage() {
    return (
        <div className="w-full h-full relative overflow-hidden flex flex-col">
            {/* SVG organic ribbon flows — folded fabric effect */}
            <div className="absolute inset-0 pointer-events-none z-[-1]">
              <div aria-hidden style={{ position: 'sticky', top: 0, height: '100vh', width: '100%', overflow: 'hidden' }}>
                {/* Top shimmer line */}
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
                  background: 'linear-gradient(to right, transparent, hsla(215,100%,70%,0.55) 40%, hsla(230,100%,65%,0.42) 65%, transparent)',
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
                      <stop offset="0%" stopColor="hsla(215,100%,60%,0.22)" />
                      <stop offset="40%" stopColor="hsla(225,90%,40%,0.10)" />
                      <stop offset="100%" stopColor="hsla(235,60%,15%,0)" />
                    </linearGradient>
                    <linearGradient id="tasks-r2" x1="1440" y1="200" x2="200" y2="900" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stopColor="hsla(225,90%,55%,0.14)" />
                      <stop offset="55%" stopColor="hsla(215,85%,45%,0.06)" />
                      <stop offset="100%" stopColor="transparent" />
                    </linearGradient>
                    <linearGradient id="tasks-r3" x1="1" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsla(215,100%,50%,0.15)" />
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
                    d="M 1600 -200 C 1300 20 1050 200 820 390 C 590 580 370 720 0 890 L 0 2000 L 1600 2000 Z"
                    fill="url(#tasks-r1)"
                  />
                  {/* FOLD 1 — valley shadow (dark blurred crease) */}
                  <path
                    d="M 1430 -60 C 1130 170 890 350 670 530 C 450 710 240 830 -80 2000"
                    stroke="hsla(10,60%,5%,0.55)"
                    strokeWidth="100"
                    fill="none"
                    filter="url(#tasks-shadow)"
                  />
                  {/* FOLD 1 — bright ridge highlight */}
                  <path
                    d="M 1430 -60 C 1130 170 890 350 670 530 C 450 710 240 830 -80 2000"
                    stroke="hsla(30,100%,76%,0.55)"
                    strokeWidth="1.5"
                    fill="none"
                  />
                  {/* FOLD 1 — soft glow halo */}
                  <path
                    d="M 1430 -60 C 1130 170 890 350 670 530 C 450 710 240 830 -80 2000"
                    stroke="hsla(22,100%,65%,0.28)"
                    strokeWidth="38"
                    fill="none"
                    filter="url(#tasks-glow)"
                  />

                  {/* FOLD 2 — secondary ribbon face */}
                  <path
                    d="M 1600 160 C 1300 360 1050 510 820 660 C 590 810 370 890 0 980 L 0 2000 L 1600 2000 Z"
                    fill="url(#tasks-r2)"
                  />
                  
                  {/* FOLD 2 — bright ridge highlight */}
                  <path
                    d="M 1430 220 C 1130 420 890 570 670 710 C 450 850 240 930 -80 2000"
                    stroke="hsla(30,100%,68%,0.32)"
                    strokeWidth="1.5"
                    fill="none"
                  />
                  {/* FOLD 2 — soft glow halo */}
                  <path
                    d="M 1430 220 C 1130 420 890 570 670 710 C 450 850 240 930 -80 2000"
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
            </div>

            <div className="w-full h-full min-h-0 flex flex-col relative z-10">
                <header className="pt-8 px-8 pb-6 relative shrink-0 z-10">
                  <h1 className="text-[32px] sm:text-[40px] font-semibold tracking-tight text-white leading-tight">Mindspace</h1>
                  <p className="text-sm font-medium text-white/40 tracking-tight mt-1">
                      Your digital corkboard. Dump anything from your mind and organize it effortlessly.
                  </p>
                </header>

                <div className="flex-1 min-h-0 px-8 pb-8 flex flex-col">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex-1 rounded-[32px] border border-white/[0.06] bg-[#1c1c1e]/40 backdrop-blur-3xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col"
                    >
                        <MindspaceBoard />
                    </motion.div>
                </div>
            </div>
        </div>
    );
}
