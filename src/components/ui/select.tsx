'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SelectContextValue {
    value?: string;
    onValueChange?: (value: string) => void;
    open: boolean;
    setOpen: (open: boolean) => void;
    options: Map<string, string>;
    registerOption: (value: string, label: string) => void;
}

const SelectContext = React.createContext<SelectContextValue | null>(null);

export const Select = ({ value, onValueChange, children }: { value?: string, onValueChange?: (val: string) => void, children: React.ReactNode }) => {
    const [open, setOpen] = React.useState(false);
    const optionsRef = React.useRef(new Map<string, string>());
    const [, setVersion] = React.useState(0);

    const registerOption = React.useCallback((val: string, label: string) => {
        if (optionsRef.current.get(val) !== label) {
            optionsRef.current.set(val, label);
            setVersion(v => v + 1);
        }
    }, []);

    return (
        <SelectContext.Provider value={{ value, onValueChange, open, setOpen, options: optionsRef.current, registerOption }}>
            <div className="relative w-full text-left" onClick={(e) => e.stopPropagation()}>
                {children}
            </div>
        </SelectContext.Provider>
    );
};

export const SelectTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(({ className, children, ...props }, ref) => {
    const context = React.useContext(SelectContext);
    return (
        <button
            ref={ref}
            type="button"
            onClick={() => context?.setOpen(!context.open)}
            className={cn(
                "flex h-10 w-full items-center justify-between rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-muted)] transition-all",
                context?.open ? "border-[var(--glass-border-hover)] bg-[var(--glass-bg-hover)]" : "",
                className
            )}
            {...props}
        >
            {children}
            <ChevronDown className={cn("h-4 w-4 opacity-50 transition-transform", context?.open ? "rotate-180" : "")} />
        </button>
    );
});
SelectTrigger.displayName = "SelectTrigger";

export const SelectValue = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement> & { placeholder?: string }>(({ className, placeholder, ...props }, ref) => {
    const context = React.useContext(SelectContext);
    const label = context?.value ? context.options.get(context.value) || context.value : placeholder || "Select...";
    return (
        <span ref={ref} className={cn("truncate pointer-events-none", className)} {...props}>
            {label}
        </span>
    );
});
SelectValue.displayName = "SelectValue";

export const SelectContent = ({ children, className }: { children: React.ReactNode, className?: string }) => {
    const context = React.useContext(SelectContext);
    
    React.useEffect(() => {
        const handleClickOutside = () => context?.setOpen(false);
        if (context?.open) {
            window.addEventListener('click', handleClickOutside);
            return () => window.removeEventListener('click', handleClickOutside);
        }
    }, [context]);

    return (
        <AnimatePresence>
            {context?.open && (
                <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className={cn(
                        "absolute z-50 mt-2 min-w-full w-max overflow-hidden rounded-xl border border-[var(--glass-border)] bg-[var(--color-bg-secondary)] backdrop-blur-2xl shadow-[var(--shadow-lg)] p-1",
                        className
                    )}
                >
                    <div className="max-h-[300px] overflow-y-auto scrollbar-thin">
                        {children}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export const SelectItem = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { value: string }>(({ className, children, value, ...props }, ref) => {
    const context = React.useContext(SelectContext);
    const isSelected = context?.value === value;
    
    React.useEffect(() => {
        if (typeof children === 'string') {
            context?.registerOption(value, children);
        } else if (React.isValidElement(children) && typeof (children.props as any).children === 'string') {
            // handle span wrappers
            context?.registerOption(value, (children.props as any).children);
        }
    }, [value, children, context]);

    return (
        <div
            ref={ref}
            onClick={() => {
                context?.onValueChange?.(value);
                context?.setOpen(false);
            }}
            className={cn(
                "relative flex w-full cursor-pointer select-none items-center rounded-lg py-2 pl-8 pr-2 text-sm outline-none transition-colors hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)] focus:bg-[var(--glass-bg-hover)]",
                isSelected ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-medium" : "text-[var(--text-secondary)]",
                className
            )}
            {...props}
        >
            <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                {isSelected && <Check className="h-4 w-4" />}
            </span>
            <span className="truncate">{children}</span>
        </div>
    );
});
SelectItem.displayName = "SelectItem";
