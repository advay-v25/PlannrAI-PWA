"use client";

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import Link from 'next/link';

type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface LiquidGlassButtonProps {
  children: React.ReactNode;
  className?: string;
  href?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
  onClick?: (e: React.MouseEvent) => void;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  title?: string;
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-4 py-2 text-xs rounded-xl gap-1.5',
  md: 'px-6 py-3 text-sm rounded-2xl gap-2',
  lg: 'px-8 py-4 text-base rounded-2xl gap-2',
  icon: 'w-10 h-10 rounded-xl p-0 flex items-center justify-center',
};

const variantBase: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--lg-primary-bg)] border-[var(--lg-primary-border)] shadow-[var(--lg-primary-shadow)] hover:bg-[var(--lg-primary-bg-hover)] hover:border-[var(--lg-primary-border-hover)] hover:shadow-[var(--lg-primary-shadow-hover)]',
  secondary: 'bg-[var(--lg-secondary-bg)] border-[var(--lg-secondary-border)] shadow-[var(--lg-secondary-shadow)] hover:bg-[var(--lg-secondary-bg-hover)] hover:border-[var(--lg-secondary-border-hover)] hover:shadow-[var(--lg-secondary-shadow-hover)]',
  ghost: 'bg-[var(--lg-ghost-bg)] border-[var(--lg-ghost-border)] shadow-[var(--lg-ghost-shadow)] hover:bg-[var(--lg-ghost-bg-hover)] hover:border-[var(--lg-ghost-border-hover)] hover:shadow-[var(--lg-ghost-shadow-hover)]',
  danger: 'bg-[var(--lg-danger-bg)] border-[var(--lg-danger-border)] shadow-[var(--lg-danger-shadow)] hover:bg-[var(--lg-danger-bg-hover)] hover:border-[var(--lg-danger-border-hover)] hover:shadow-[var(--lg-danger-shadow-hover)]',
};

export function LiquidGlassButton({
  children,
  className,
  href,
  size = 'md',
  variant = 'primary',
  onClick,
  disabled = false,
  type = 'button',
  title,
}: LiquidGlassButtonProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const buttonClasses = cn(
    'relative overflow-hidden font-medium cursor-pointer flex items-center justify-center text-[var(--text-primary)]',
    'backdrop-blur-xl border transition-all duration-300 select-none hover:scale-[1.02] active:scale-[0.98]',
    sizeClasses[size],
    variantBase[variant],
    disabled && 'opacity-40 cursor-not-allowed pointer-events-none hover:scale-100 active:scale-100',
    className,
  );

  const content = (
    <>
      {/* Refraction gradient */}
      <div
        className="absolute inset-0 rounded-[inherit] pointer-events-none transition-opacity duration-500"
        style={{
          background: variant === 'danger'
            ? 'linear-gradient(135deg, rgba(239,68,68,0.15) 0%, rgba(239,68,68,0.05) 100%)'
            : 'linear-gradient(135deg, rgba(168,85,247,0.15) 0%, rgba(217,4,121,0.1) 50%, rgba(245,158,11,0.08) 100%)',
          opacity: isHovered ? 1 : 0,
        }}
      />

      {/* Sweeping light streak */}
      {mounted && (
        <motion.div
          className="absolute inset-0 rounded-[inherit] pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.12) 50%, transparent 100%)',
            skewX: -12,
          }}
          animate={{ x: ['-100%', '200%'] }}
          transition={{ duration: 3, ease: 'linear', repeat: Infinity, repeatDelay: 2 }}
        />
      )}

      {/* Content */}
      <span className="relative z-10 flex items-center justify-center gap-[inherit]">
        {children}
      </span>
    </>
  );

  if (href && !disabled) {
    return (
      <Link
        href={href}
        title={title}
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={buttonClasses}
        suppressHydrationWarning
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={buttonClasses}
      suppressHydrationWarning
    >
      {content}
    </button>
  );
}

