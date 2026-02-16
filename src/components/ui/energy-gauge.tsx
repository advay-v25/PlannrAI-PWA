'use client';

import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/ui/glass-card';

interface EnergyGaugeProps {
    level: number; // 1-5
    className?: string;
    showLabel?: boolean;
    size?: 'sm' | 'md' | 'lg';
}

export function EnergyGauge({ level, className, size = 'md', showLabel = true }: EnergyGaugeProps) {
    // Determine color based on level
    const getColor = (l: number) => {
        if (l >= 4) return 'var(--color-success)'; // High
        if (l === 3) return 'var(--color-primary)'; // Medium
        return 'var(--color-warning)'; // Low
    };

    const color = getColor(level);

    // Size mappings
    const dimensions = {
        sm: { w: 60, h: 30, r: 26, stroke: 4 },
        md: { w: 96, h: 48, r: 42, stroke: 6 },
        lg: { w: 140, h: 70, r: 60, stroke: 8 }
    };

    const { w, h, r, stroke } = dimensions[size];
    const circumference = Math.PI * r; // Half circle length

    return (
        <div className={cn("relative flex flex-col items-center justify-center", className)}>
            {/* Gauge Graphic */}
            <div className="relative overflow-hidden" style={{ width: w, height: h }}>
                {/* Background Arc */}
                <div
                    className="absolute top-0 left-0 rounded-full border-[var(--glass-border)] box-border"
                    style={{
                        width: w,
                        height: w,
                        borderWidth: stroke
                    }}
                />

                {/* Active Arc (SVG) */}
                <svg
                    className="absolute top-0 left-0 -rotate-90"
                    style={{ width: w, height: w }}
                >
                    {/* Track */}
                    <circle
                        cx={w / 2} cy={w / 2} r={r}
                        fill="none"
                        stroke="var(--glass-border)"
                        strokeWidth={stroke}
                        strokeDasharray={`${circumference} ${circumference * 2}`}
                        className="opacity-30"
                    />
                    {/* Progress */}
                    <motion.circle
                        cx={w / 2} cy={w / 2} r={r}
                        fill="none"
                        stroke={color}
                        strokeWidth={stroke}
                        strokeLinecap="round"
                        strokeDasharray={`${circumference} ${circumference * 2}`}
                        initial={{ strokeDashoffset: circumference }}
                        animate={{ strokeDashoffset: circumference - (circumference * (level / 5)) }}
                        transition={{ duration: 1, ease: "easeOut" }}
                    />
                </svg>

                {/* Icon in center bottom */}
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/3 z-10">
                    <div
                        className={cn(
                            "rounded-full bg-[var(--glass-bg)] border border-[var(--glass-border)] flex items-center justify-center backdrop-blur-sm shadow-sm",
                            size === 'sm' ? "w-6 h-6" : size === 'lg' ? "w-10 h-10" : "w-8 h-8"
                        )}
                    >
                        <Zap
                            className={cn(
                                "text-[var(--color-primary)]",
                                size === 'sm' ? "w-3 h-3" : size === 'lg' ? "w-5 h-5" : "w-4 h-4"
                            )}
                            style={{ color }}
                        />
                    </div>
                </div>
            </div>

            {/* Label */}
            {showLabel && (
                <div className="mt-2 text-center">
                    <div className={cn(
                        "font-bold font-mono tracking-tighter flex items-center justify-center gap-1",
                        size === 'sm' ? "text-sm" : size === 'lg' ? "text-2xl" : "text-xl"
                    )}>
                        {level}<span className="text-[var(--text-tertiary)] text-xs">/5</span>
                    </div>
                </div>
            )}
        </div>
    );
}
