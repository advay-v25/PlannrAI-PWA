'use client';

import { forwardRef, InputHTMLAttributes, TextareaHTMLAttributes, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface GlassInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onDrag' | 'onDragEnd' | 'onDragStart' | 'onAnimationStart' | 'onAnimationEnd'> {
    label?: string;
    error?: string;
    hint?: string;
}

export const GlassInput = forwardRef<HTMLInputElement, GlassInputProps>(
    ({ className, label, error, hint, type = 'text', onFocus, onBlur, ...props }, ref) => {
        const [isFocused, setIsFocused] = useState(false);

        return (
            <div className="space-y-1.5">
                {label && (
                    <label className="block text-sm font-medium text-[var(--color-text-secondary)]">
                        {label}
                    </label>
                )}
                <div className="relative">
                    <input
                        ref={ref}
                        type={type}
                        className={cn(
                            'w-full px-4 py-3 rounded-xl',
                            'bg-[var(--glass-bg)] backdrop-blur-xl',
                            'border border-[var(--glass-border)]',
                            'text-[var(--color-text-primary)] placeholder:text-white/20',
                            'transition-all duration-200',
                            'focus:outline-none focus:border-[var(--color-primary)]',
                            error && 'border-red-500/50',
                            className
                        )}
                        onFocus={(e) => {
                            setIsFocused(true);
                            onFocus?.(e);
                        }}
                        onBlur={(e) => {
                            setIsFocused(false);
                            onBlur?.(e);
                        }}
                        {...props}
                    />
                    {/* Focus glow effect */}
                    <AnimatePresence>
                        {isFocused && (
                            <motion.div
                                className="absolute inset-0 rounded-xl pointer-events-none"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                style={{
                                    boxShadow: '0 0 20px var(--color-primary-glow)',
                                }}
                            />
                        )}
                    </AnimatePresence>
                </div>
                {(error || hint) && (
                    <p className={cn(
                        'text-xs',
                        error ? 'text-red-400' : 'text-[var(--color-text-muted)]'
                    )}>
                        {error || hint}
                    </p>
                )}
            </div>
        );
    }
);

GlassInput.displayName = 'GlassInput';

interface GlassTextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onDrag' | 'onDragEnd' | 'onDragStart' | 'onAnimationStart' | 'onAnimationEnd'> {
    label?: string;
    error?: string;
    hint?: string;
}

export const GlassTextarea = forwardRef<HTMLTextAreaElement, GlassTextareaProps>(
    ({ className, label, error, hint, onFocus, onBlur, ...props }, ref) => {
        const [isFocused, setIsFocused] = useState(false);

        return (
            <div className="space-y-1.5">
                {label && (
                    <label className="block text-sm font-medium text-[var(--color-text-secondary)]">
                        {label}
                    </label>
                )}
                <div className="relative">
                    <textarea
                        ref={ref}
                        className={cn(
                            'w-full px-4 py-3 rounded-xl resize-none',
                            'bg-[var(--glass-bg)] backdrop-blur-xl',
                            'border border-[var(--glass-border)]',
                            'text-[var(--color-text-primary)] placeholder:text-white/50',
                            'transition-all duration-200',
                            'focus:outline-none focus:border-[var(--color-primary)]',
                            'min-h-[120px]',
                            error && 'border-red-500/50',
                            className
                        )}
                        onFocus={(e) => {
                            setIsFocused(true);
                            onFocus?.(e);
                        }}
                        onBlur={(e) => {
                            setIsFocused(false);
                            onBlur?.(e);
                        }}
                        {...props}
                    />
                    <AnimatePresence>
                        {isFocused && (
                            <motion.div
                                className="absolute inset-0 rounded-xl pointer-events-none"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                style={{
                                    boxShadow: '0 0 20px var(--color-primary-glow)',
                                }}
                            />
                        )}
                    </AnimatePresence>
                </div>
                {(error || hint) && (
                    <p className={cn(
                        'text-xs',
                        error ? 'text-red-400' : 'text-[var(--color-text-muted)]'
                    )}>
                        {error || hint}
                    </p>
                )}
            </div>
        );
    }
);

GlassTextarea.displayName = 'GlassTextarea';
