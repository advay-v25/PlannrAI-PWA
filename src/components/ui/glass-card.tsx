'use client';

import { forwardRef, HTMLAttributes } from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface GlassCardProps extends HTMLMotionProps<'div'> {
    variant?: 'default' | 'glow' | 'deep' | 'outline' | 'breathe';
    padding?: 'none' | 'sm' | 'md' | 'lg';
    interactive?: boolean;
    children?: ReactNode;
}

const paddingClasses = {
    none: '',
    sm: 'p-3',
    md: 'p-4 md:p-5',
    lg: 'p-5 md:p-6',
};

const variants = {
    default: "bg-[var(--glass-bg)] border-[var(--glass-border)] shadow-md",
    glow: "bg-[var(--glass-bg)] border-[var(--color-primary)]/20 shadow-glow",
    deep: "bg-[var(--color-bg-elevated)]/40 border-[var(--glass-border)] backdrop-blur-xl shadow-xl",
    outline: "bg-transparent border-[var(--glass-border)]",
    breathe: "bg-[var(--glass-bg)] border-[var(--glass-border)] animate-pulse shadow-glow",
};

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
    ({
        className,
        variant = 'default',
        padding = 'md',
        interactive = false,
        children,
        ...props
    }, ref) => {
        return (
            <motion.div
                ref={ref}
                className={cn(
                    'relative overflow-hidden border backdrop-blur-md rounded-[var(--radius-2xl)] transition-all duration-300 ease-out',
                    variants[variant],
                    paddingClasses[padding],
                    interactive && "cursor-pointer hover:border-[var(--glass-border-hover)] hover:translate-y-[-2px] active:scale-[0.98]",
                    className
                )}
                whileHover={interactive ? { y: -2 } : undefined}
                whileTap={interactive ? { scale: 0.98 } : undefined}
                {...props}
            >
                {variant === 'glow' && (
                    <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-primary)]/5 to-transparent pointer-events-none" />
                )}
                {children}
            </motion.div>
        );
    }
);

GlassCard.displayName = 'GlassCard';

export function StaticGlassCard({
    className,
    variant = 'default',
    padding = 'md',
    children,
    ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: string; padding?: string }) {
    return (
        <div
            className={cn(
                'relative overflow-hidden border backdrop-blur-md rounded-[var(--radius-2xl)]',
                variants[variant as keyof typeof variants],
                paddingClasses[padding as keyof typeof paddingClasses],
                className
            )}
            {...props}
        >
            {children}
        </div>
    );
}
