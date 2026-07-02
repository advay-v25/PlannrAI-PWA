'use client';

import { forwardRef, InputHTMLAttributes, TextareaHTMLAttributes, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Eye, EyeOff } from 'lucide-react';

interface GlassInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onDrag' | 'onDragEnd' | 'onDragStart' | 'onAnimationStart' | 'onAnimationEnd'> {
    label?: string;
    error?: string;
    hint?: string;
}

export const GlassInput = forwardRef<HTMLInputElement, GlassInputProps>(
    ({ className, label, error, hint, type = 'text', onFocus, onBlur, ...props }, ref) => {
        const [isFocused, setIsFocused] = useState(false);
        const [showPassword, setShowPassword] = useState(false);

        const isPassword = type === 'password';
        const inputType = isPassword ? (showPassword ? 'text' : 'password') : type;

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
                        type={inputType}
                        className={cn(
                            'w-full pl-4 py-3 rounded-xl',
                            isPassword ? 'pr-12' : 'pr-4',
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
                    {isPassword && (
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors p-1.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-500/50 z-20"
                            aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                            {showPassword ? (
                                <EyeOff className="w-4 h-4" />
                            ) : (
                                <Eye className="w-4 h-4" />
                            )}
                        </button>
                    )}
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
