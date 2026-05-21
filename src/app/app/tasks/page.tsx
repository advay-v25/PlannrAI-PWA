'use client';

import { ActionCenter } from '@/components/todos/ActionCenter';
import { motion } from 'framer-motion';
import { PageBackground } from '@/components/ui/PageBackground';

export default function TasksPage() {
    return (
        <div className="flex flex-col min-h-[calc(100vh-8rem)] w-full max-w-[1600px] mx-auto relative overflow-y-auto custom-scrollbar">
            {/* Base gradient to ensure legibility while letting PageBackground shine through */}
            <div className="fixed inset-0 bg-gradient-to-b from-black/60 via-black/80 to-[#050508] pointer-events-none -z-10 rounded-3xl" />
            <div className="fixed inset-0 -z-10 overflow-hidden rounded-3xl pointer-events-none">
                <PageBackground color="teal" variant="horizon" intensity="medium" />
            </div>

            {/* Header */}
            <header className="mb-6 relative shrink-0 p-6 pb-0">
                <div style={{
                    position: 'absolute', bottom: '-10px', left: '24px', right: '24px',
                    height: '1px', background: 'linear-gradient(to right, rgba(20,184,166,0.3) 0%, rgba(20,184,166,0.05) 100%)'
                }} />
                <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60 mb-2 tracking-tight">
                    Thoughts & Tasks
                </h1>
                <p className="text-sm font-medium text-white/40 tracking-wide max-w-2xl leading-relaxed">
                    Capture your ideas, thoughts, and small tasks instantly. Assign colors to differentiate and organize your workflow without boundaries.
                </p>
            </header>

            {/* Kanban Board Container -> Now Masonry Container */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex-1 w-full px-6 pb-6"
            >
                <div className="w-full">
                    <ActionCenter />
                </div>
            </motion.div>
        </div>
    );
}
