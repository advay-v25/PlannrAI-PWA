'use client';

import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/ui/glass-card';

interface EnergyGaugeProps {
    level: number; // 1-5
    className?: string;
    showLabel?: boolean;
}

export function EnergyGauge({ level, className, showLabel = true }: EnergyGaugeProps) {
    // Determine color based on level
    const getColor = (l: number) => {
        if (l >= 4) return 'var(--color-success)'; // High
        if (l === 3) return 'var(--color-primary)'; // Medium
        return 'var(--color-warning)'; // Low
    };

    const color = getColor(level);

    // Calculate progress for arc (1-5 maps to 20%-100%)
    // But let's make it a semi-circle gauge (180 degrees)
    // 1 -> 36deg, 5 -> 180deg
    const percentage = (level / 5) * 100;

    return (
        <div className={cn("relative flex flex-col items-center justify-center", className)}>
            {/* Gauge Graphic */}
            <div className="relative w-24 h-12 overflow-hidden">
                {/* Background Arc */}
                <div className="absolute top-0 left-0 w-24 h-24 rounded-full border-[6px] border-[var(--glass-border)] box-border" />

                {/* Active Arc (Using conic-gradient or SVG for ease) */}
                {/* Let's use SVG for smooth animation */}
                <svg className="absolute top-0 left-0 w-24 h-24 -rotate-90">
                    <circle
                        cx="48" cy="48" r="42"
                        fill="none"
                        stroke="var(--glass-border)"
                        strokeWidth="6"
                        strokeDasharray="132 264" // Half circle approx
                        className="opacity-30"
                    />
                    <motion.circle
                        cx="48" cy="48" r="42"
                        fill="none"
                        stroke={color}
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeDasharray="132 264" // Max dash is half circumference (~132)
                        initial={{ strokeDashoffset: 132 }}
                        animate={{ strokeDashoffset: 132 - (132 * (level / 5)) }}
                        transition={{ duration: 1, ease: "easeOut" }}
                    />
                </svg>

                {/* Icon in center bottom */}
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 z-10">
                    <div className="w-8 h-8 rounded-full bg-[var(--glass-bg)] border border-[var(--glass-border)] flex items-center justify-center backdrop-blur-sm shadow-sm">
                        <Zap className="w-4 h-4" style={{ color }} />
                    </div>
                </div>
            </div>

            {/* Label */}
            {showLabel && (
                <div className="mt-2 text-center">
                    <div className="text-xl font-bold font-mono tracking-tighter flex items-center justify-center gap-1">
                        {level}<span className="text-[var(--text-tertiary)] text-xs">/5</span>
                    </div>
                    <p className="text-[10px] uppercase tracking-widest text-[var(--text-tertiary)]">
                        Energy
                    </p>
                </div>
            )}
        </div>
    );
}
