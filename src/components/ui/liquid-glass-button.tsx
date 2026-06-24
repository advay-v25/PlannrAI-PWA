"use client";

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';

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
  primary: 'bg-white/[0.07] border-white/[0.15] shadow-[0_8px_32px_0_rgba(0,0,0,0.37),inset_0_1px_0_rgba(255,255,255,0.12)]',
  secondary: 'bg-white/[0.04] border-white/[0.08] shadow-[0_4px_16px_0_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.06)]',
  ghost: 'bg-transparent border-white/[0.06] shadow-none',
  danger: 'bg-red-500/[0.08] border-red-500/[0.2] shadow-[0_4px_16px_0_rgba(239,68,68,0.1),inset_0_1px_0_rgba(255,255,255,0.06)]',
};

const variantHover: Record<ButtonVariant, object> = {
  primary: {
    borderColor: 'rgba(255, 255, 255, 0.25)',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    boxShadow: '0 8px 32px 0 rgba(168, 85, 247, 0.2), inset 0 1px 0 rgba(255,255,255,0.2), 0 0 40px rgba(217, 4, 121, 0.1)',
  },
  secondary: {
    borderColor: 'rgba(255, 255, 255, 0.18)',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    boxShadow: '0 8px 24px 0 rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255,255,255,0.12)',
  },
  ghost: {
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  danger: {
    borderColor: 'rgba(239, 68, 68, 0.4)',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    boxShadow: '0 8px 32px 0 rgba(239, 68, 68, 0.2), inset 0 1px 0 rgba(255,255,255,0.1)',
  },
};

import Link from 'next/link';

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

  const innerProps = {
    className: cn(
      'relative overflow-hidden font-medium text-white cursor-pointer flex items-center justify-center',
      'backdrop-blur-xl border transition-colors duration-300',
      sizeClasses[size],
      variantBase[variant],
      disabled && 'opacity-40 cursor-not-allowed',
      className,
    ),
    onHoverStart: () => !disabled && setIsHovered(true),
    onHoverEnd: () => setIsHovered(false),
    whileHover: disabled ? undefined : { scale: 1.03, ...(variantHover[variant] as any) },
    whileTap: disabled ? undefined : { scale: 0.97 },
    transition: { type: 'spring' as const, stiffness: 200, damping: 25, mass: 1.2 }
  };

  const content = (
    <>
      {/* Refraction gradient */}
      <motion.div
        className="absolute inset-0 rounded-[inherit] pointer-events-none"
        style={{
          background: variant === 'danger'
            ? 'linear-gradient(135deg, rgba(239,68,68,0.15) 0%, rgba(239,68,68,0.05) 100%)'
            : 'linear-gradient(135deg, rgba(168,85,247,0.15) 0%, rgba(217,4,121,0.1) 50%, rgba(245,158,11,0.08) 100%)',
        }}
        animate={{ opacity: isHovered ? 1 : 0 }}
        transition={{ duration: 0.6 }}
      />

      {/* Sweeping light streak */}
      <motion.div
        className="absolute inset-0 rounded-[inherit] pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.12) 50%, transparent 100%)',
          skewX: -12,
        }}
        animate={{ x: isHovered ? '200%' : '-100%' }}
        transition={{ duration: 1.2, ease: 'easeInOut' }}
      />

      {/* Content */}
      <span className="relative z-10 flex items-center justify-center gap-[inherit]">
        {children}
      </span>
    </>
  );

  if (href && !disabled) {
    return (
      <Link href={href} title={title} onClick={onClick as any} className={innerProps.className}>
        <motion.span
          onHoverStart={innerProps.onHoverStart}
          onHoverEnd={innerProps.onHoverEnd}
          whileHover={innerProps.whileHover}
          whileTap={innerProps.whileTap}
          transition={innerProps.transition}
          className="relative w-full h-full flex items-center justify-center"
        >
          {content}
        </motion.span>
      </Link>
    );
  }

  return (
    <motion.button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      {...innerProps as any}
    >
      {content}
    </motion.button>
  );
}
