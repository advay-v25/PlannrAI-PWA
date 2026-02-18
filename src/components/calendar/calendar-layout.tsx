'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface CalendarLayoutProps {
    controlStack: React.ReactNode;
    weekGrid: React.ReactNode;
    inspector: React.ReactNode;
    showInspector: boolean;
}

export function CalendarLayout({ controlStack, weekGrid, inspector, showInspector }: CalendarLayoutProps) {
    return (
        <div className="flex h-[calc(100vh-6rem)] gap-4 p-4 overflow-hidden relative">

            {/* LEFT: Control Stack */}
            <motion.aside
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="w-64 max-w-xs shrink-0 flex flex-col gap-4 overflow-y-auto no-scrollbar rounded-3xl"
            >
                {controlStack}
            </motion.aside>

            {/* CENTER: Timeline Grid (Mission Control) */}
            <motion.main
                layout
                className="flex-1 glass-card overflow-hidden relative shadow-2xl"
            >
                {weekGrid}
            </motion.main>

            {/* RIGHT: Inspector (Context) */}
            <AnimatePresence mode="popLayout">
                {showInspector && (
                    <motion.aside
                        initial={{ opacity: 0, x: 20, width: 0 }}
                        animate={{ opacity: 1, x: 0, width: 320 }}
                        exit={{ opacity: 0, x: 20, width: 0 }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        className="shrink-0 whitespace-nowrap overflow-hidden"
                    >
                        <div className="w-80 h-full glass border-l border-white/5 overflow-y-auto no-scrollbar">
                            {inspector}
                        </div>
                    </motion.aside>
                )}
            </AnimatePresence>

        </div>
    );
}
