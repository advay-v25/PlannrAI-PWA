'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Activity } from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';

interface CollapsedInsightsProps {
    progressBars: React.ReactNode;
    energyCheckin: React.ReactNode;
}

export function CollapsedInsights({ progressBars, energyCheckin }: CollapsedInsightsProps) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="w-full">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between py-4 text-[var(--text-secondary)] hover:text-white transition-colors group border-t border-[var(--glass-border)]"
            >
                <div className="flex items-center gap-2">
                    <Activity size={16} className="text-[var(--text-tertiary)] group-hover:text-[var(--color-primary)] transition-colors" />
                    <span className="text-sm font-semibold tracking-wide">System Insights</span>
                </div>
                {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        className="overflow-hidden"
                    >
                        <div className="flex flex-col gap-8 py-6">
                            <div>
                                <h4 className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest mb-4">Energy Trends</h4>
                                {energyCheckin}
                            </div>
                            <div>
                                <h4 className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest mb-4">Progress</h4>
                                {progressBars}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
