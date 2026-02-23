'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface CalendarLayoutProps {
    header: React.ReactNode;
    weekGrid: React.ReactNode;
    inspector: React.ReactNode;
    showInspector: boolean;
    inbox: React.ReactNode;
    showInbox: boolean;
}

export function CalendarLayout({ header, weekGrid, inspector, showInspector, inbox, showInbox }: CalendarLayoutProps) {
    return (
        <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
            {/* Header / Action Bar */}
            <div className="shrink-0 px-4 md:px-6 py-3 border-b border-white/5 bg-black/60 backdrop-blur-xl">
                {header}
            </div>

            {/* Main Content */}
            <div className="flex flex-1 overflow-hidden relative">
                {/* Grid */}
                <motion.main
                    layout
                    className={cn(
                        "flex-1 overflow-hidden relative",
                        showInspector ? "mr-0" : ""
                    )}
                >
                    {weekGrid}
                </motion.main>

                {/* Right Area (Inspector OR Inbox) */}
                <AnimatePresence mode="popLayout">
                    {(showInspector || showInbox) && (
                        <motion.aside
                            initial={{ opacity: 0, x: 20, width: 0 }}
                            animate={{ opacity: 1, x: 0, width: 340 }}
                            exit={{ opacity: 0, x: 20, width: 0 }}
                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                            className="shrink-0 overflow-hidden border-l border-white/5 bg-black/40 backdrop-blur-xl"
                        >
                            <div className="w-[340px] h-full overflow-y-auto no-scrollbar relative flex flex-col">
                                {showInspector ? (
                                    <motion.div
                                        key="inspector"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        className="absolute inset-0 h-full overflow-y-auto"
                                    >
                                        {inspector}
                                    </motion.div>
                                ) : showInbox ? (
                                    <motion.div
                                        key="inbox"
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 20 }}
                                        className="absolute inset-0 h-full flex flex-col"
                                    >
                                        {inbox}
                                    </motion.div>
                                ) : null}
                            </div>
                        </motion.aside>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
