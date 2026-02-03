'use client';

import { forwardRef, HTMLAttributes } from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';

interface GlassCardProps extends HTMLMotionProps<'div'> {
    variant?: 'default' | 'glow' | 'breathe';
    padding?: 'none' | 'sm' | 'md' | 'lg';
    interactive?: boolean;
}

const paddingClasses = {
    none: '',
    sm: 'p-3',
    md: 'p-4 md:p-5',
    lg: 'p-5 md:p-6',
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
        const baseClasses = cn(
            'glass border border-[var(--glass-border)] shadow-lg backdrop-blur-xl',
            variant === 'glow' && 'shadow-[0_0_30px_var(--color-primary-muted)] border-[var(--color-primary-muted)]',
            variant === 'breathe' && 'animate-pulse',
            paddingClasses[padding],
            interactive && 'cursor-pointer hover:border-[var(--glass-border-hover)] hover:bg-[var(--glass-bg-hover)] transition-all duration-300',
            className
        );

        return (
            <motion.div
                ref={ref}
                className={baseClasses}
                whileHover={interactive ? { scale: 1.01, y: -2 } : undefined}
                whileTap={interactive ? { scale: 0.99 } : undefined}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                {...props}
            >
                {children}
            </motion.div>
        );
    }
);

GlassCard.displayName = 'GlassCard';

// Simple non-animated version for server components
interface StaticGlassCardProps extends HTMLAttributes<HTMLDivElement> {
    variant?: 'default' | 'glow' | 'breathe';
    padding?: 'none' | 'sm' | 'md' | 'lg';
}

export function StaticGlassCard({
    className,
    variant = 'default',
    padding = 'md',
    children,
    ...props
}: StaticGlassCardProps) {
    return (
        <div
            className={cn(
                'glass',
                variant === 'glow' && 'glass-glow',
                variant === 'breathe' && 'glass-breathe',
                paddingClasses[padding],
                className
            )}
            {...props}
        >
            {children}
        </div>
    );
}
