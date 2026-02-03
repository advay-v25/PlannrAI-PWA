'use client';

import { forwardRef, ButtonHTMLAttributes } from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface GlassButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
    variant?: 'default' | 'primary' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    loading?: boolean;
    disabled?: boolean;
    children: React.ReactNode;
}

const variants = {
    default: 'glass hover:bg-[var(--glass-bg-hover)] active:bg-[var(--glass-bg-active)]',
    primary: 'bg-gradient-to-r from-[var(--color-primary)] to-[#38bdf8] hover:opacity-90 text-black border-transparent shadow-[0_0_20px_rgba(6,182,212,0.5)] hover:shadow-[0_0_30px_rgba(6,182,212,0.6)]',
    ghost: 'bg-transparent hover:bg-[var(--glass-bg)] border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
    danger: 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/20 hover:border-red-500/40',
};

const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
};

export const GlassButton = forwardRef<HTMLButtonElement, GlassButtonProps>(
    ({
        className,
        variant = 'default',
        size = 'md',
        loading = false,
        disabled = false,
        children,
        ...props
    }, ref) => {
        return (
            <motion.button
                ref={ref}
                className={cn(
                    'inline-flex items-center justify-center gap-2',
                    'font-medium rounded-xl',
                    'border border-[var(--glass-border)]',
                    'transition-colors duration-200',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-primary)]',
                    'disabled:opacity-50 disabled:pointer-events-none',
                    variants[variant],
                    sizes[size],
                    className
                )}
                disabled={disabled || loading}
                whileHover={{ scale: disabled ? 1 : 1.02 }}
                whileTap={{ scale: disabled ? 1 : 0.98 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                {...props}
            >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {children}
            </motion.button>
        );
    }
);

GlassButton.displayName = 'GlassButton';

// Static version for non-interactive contexts
interface StaticGlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'default' | 'primary' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    loading?: boolean;
}

export function StaticGlassButton({
    className,
    variant = 'default',
    size = 'md',
    loading = false,
    disabled = false,
    children,
    ...props
}: StaticGlassButtonProps) {
    return (
        <button
            className={cn(
                'inline-flex items-center justify-center gap-2',
                'font-medium rounded-xl',
                'border border-[var(--glass-border)]',
                'transition-all duration-200',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]',
                'disabled:opacity-50 disabled:pointer-events-none',
                'active:scale-[0.98]',
                variants[variant],
                sizes[size],
                className
            )}
            disabled={disabled || loading}
            {...props}
        >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {children}
        </button>
    );
}
