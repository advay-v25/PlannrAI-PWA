'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

interface GlassToggleProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label?: string;
    description?: string;
    disabled?: boolean;
}

export function GlassToggle({
    checked,
    onChange,
    label,
    description,
    disabled = false,
}: GlassToggleProps) {
    return (
        <div
            className={cn(
                'flex items-center justify-between gap-4',
                disabled && 'opacity-50 pointer-events-none'
            )}
        >
            {(label || description) && (
                <div className="flex-1">
                    {label && (
                        <p className="text-sm font-medium text-[var(--color-text-primary)]">
                            {label}
                        </p>
                    )}
                    {description && (
                        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                            {description}
                        </p>
                    )}
                </div>
            )}
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                onClick={() => onChange(!checked)}
                disabled={disabled}
                className={cn(
                    'relative w-12 h-7 rounded-full',
                    'transition-colors duration-300',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-primary)]',
                    checked
                        ? 'bg-[var(--color-primary)]'
                        : 'bg-[var(--glass-bg)] border border-[var(--glass-border)]'
                )}
            >
                <motion.div
                    className={cn(
                        'absolute top-0.5 w-6 h-6 rounded-full',
                        'flex items-center justify-center',
                        'shadow-lg',
                        checked ? 'bg-white' : 'bg-[var(--color-text-secondary)]'
                    )}
                    animate={{
                        left: checked ? '22px' : '2px',
                    }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                >
                    <AnimatePresence>
                        {checked && (
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                exit={{ scale: 0 }}
                            >
                                <Check className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>
            </button>
        </div>
    );
}

interface GlassSliderProps {
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    label?: string;
    showValue?: boolean;
    formatValue?: (value: number) => string;
}

export function GlassSlider({
    value,
    onChange,
    min = 0,
    max = 100,
    step = 1,
    label,
    showValue = true,
    formatValue = (v) => v.toString(),
}: GlassSliderProps) {
    const percentage = ((value - min) / (max - min)) * 100;

    return (
        <div className="space-y-2">
            {(label || showValue) && (
                <div className="flex items-center justify-between">
                    {label && (
                        <label className="text-sm font-medium text-[var(--color-text-secondary)]">
                            {label}
                        </label>
                    )}
                    {showValue && (
                        <span className="text-sm font-medium text-[var(--color-primary)]">
                            {formatValue(value)}
                        </span>
                    )}
                </div>
            )}
            <div className="relative h-2 rounded-full bg-[var(--glass-bg)] border border-[var(--glass-border)]">
                <motion.div
                    className="absolute top-0 left-0 h-full rounded-full bg-[var(--color-primary)]"
                    style={{ width: `${percentage}%` }}
                    initial={false}
                    animate={{ width: `${percentage}%` }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(e) => onChange(Number(e.target.value))}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <motion.div
                    className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white shadow-lg border-2 border-[var(--color-primary)] pointer-events-none"
                    animate={{ left: `calc(${percentage}% - 8px)` }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
            </div>
        </div>
    );
}
