
'use client';

import { motion } from 'framer-motion';
import { Sparkles, Play, RotateCcw } from 'lucide-react';
import { useState, useEffect } from 'react';

interface BriefingModuleProps {
    briefing?: string; // Markdown or plain text
    isLoading?: boolean;
    onGenerate?: () => void;
}

export function BriefingModule({ briefing, isLoading, onGenerate }: BriefingModuleProps) {
    const [displayedText, setDisplayedText] = useState('');

    // Typing effect
    useEffect(() => {
        if (!briefing) return;
        setDisplayedText('');
        let i = 0;
        const interval = setInterval(() => {
            setDisplayedText(briefing.slice(0, i));
            i++;
            if (i > briefing.length) clearInterval(interval);
        }, 15); // Adjust speed
        return () => clearInterval(interval);
    }, [briefing]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-6 relative overflow-hidden group min-h-[160px] flex flex-col justify-between"
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-[var(--color-primary-muted)]">
                        <Sparkles className="w-4 h-4 text-[var(--color-primary)]" />
                    </div>
                    <h3 className="text-sm font-semibold tracking-wide text-[var(--text-secondary)]">
                        DAILY BRIEFING
                    </h3>
                </div>
                {!briefing && !isLoading && (
                    <button
                        onClick={onGenerate}
                        className="btn-ghost text-xs px-3 py-1.5 rounded-full hover:bg-[var(--glass-bg)] transition-colors"
                    >
                        Generate
                    </button>
                )}
                {briefing && !isLoading && (
                    <button
                        onClick={onGenerate}
                        className="text-[10px] uppercase font-bold tracking-widest px-3 py-1 rounded-full bg-[var(--glass-bg)] hover:bg-[var(--glass-bg)] text-[var(--text-secondary)] hover:text-white transition-colors flex items-center gap-1.5"
                    >
                        <RotateCcw className="w-3 h-3" />
                        Refresh
                    </button>
                )}
            </div>

            {/* Content Area */}
            <div className="relative z-10">
                {isLoading ? (
                    <div className="space-y-3 animate-pulse">
                        <div className="h-4 bg-[var(--glass-bg)] rounded w-3/4"></div>
                        <div className="h-4 bg-[var(--glass-bg)] rounded w-full"></div>
                        <div className="h-4 bg-[var(--glass-bg)] rounded w-5/6"></div>
                    </div>
                ) : briefing ? (
                    <p className="text-[15px] leading-relaxed text-[var(--text-secondary)] font-medium">
                        {displayedText}
                        <span className="inline-block w-1.5 h-4 ml-1 align-middle bg-[var(--color-primary)] animate-pulse" />
                    </p>
                ) : (
                    <div className="flex flex-col items-center justify-center py-4 text-center">
                        <p className="text-sm text-[var(--text-secondary)] mb-3">
                            Ready to synthesize your day?
                        </p>
                        <button
                            onClick={onGenerate}
                            className="btn-primary rounded-full pl-4 pr-5 py-2 flex items-center gap-2 text-xs"
                        >
                            <Play className="w-3 h-3 fill-current" />
                            Initialize Briefing
                        </button>
                    </div>
                )}
            </div>

            {/* Background Decor */}
            <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--color-primary)] blur-[80px] rounded-full" />
            </div>
        </motion.div>
    );
}
