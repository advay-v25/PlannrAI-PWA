'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, AlertTriangle, Info, Sparkles } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning' | 'ai';

interface Toast {
    id: string;
    message: string;
    type: ToastType;
    duration?: number;
    action?: ReactNode;
}

interface ToastContextValue {
    toasts: Toast[];
    showToast: (message: string, type?: ToastType, duration?: number, action?: ReactNode) => void;
    showSuccess: (message: string, undoAction?: () => void) => void;
    showError: (message: string, retryAction?: () => void) => void;
    dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
}

const TOAST_ICONS: Record<ToastType, typeof Check> = {
    success: Check,
    error: AlertTriangle,
    warning: AlertTriangle,
    info: Info,
    ai: Sparkles,
};

const TOAST_COLORS: Record<ToastType, string> = {
    success: 'var(--color-success)',
    error: 'var(--color-error)',
    warning: 'var(--color-warning)',
    info: 'var(--color-primary)',
    ai: 'var(--color-primary)',
};

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = useCallback((message: string, type: ToastType = 'info', duration: number = 3000, action?: ReactNode) => {
        const id = crypto.randomUUID();
        setToasts(prev => [...prev, { id, message, type, duration, action }]);

        if (duration > 0) {
            setTimeout(() => {
                setToasts(prev => prev.filter(t => t.id !== id));
            }, duration);
        }
    }, []);

    const showSuccess = useCallback((message: string, undoAction?: () => void) => {
        showToast(message, 'success', 4000,
            undoAction ? (
                <button
                    onClick={undoAction}
                    className="text-xs font-bold underline hover:opacity-80"
                >
                    UNDO
                </button>
            ) : undefined
        );
    }, [showToast]);

    const showError = useCallback((message: string, retryAction?: () => void) => {
        showToast(message, 'error', 6000,
            retryAction ? (
                <button
                    onClick={retryAction}
                    className="text-xs font-bold underline hover:opacity-80"
                >
                    RETRY
                </button>
            ) : undefined
        );
    }, [showToast]);

    const dismissToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ toasts, showToast, showSuccess, showError, dismissToast }}>
            {children}
            <ToastContainer toasts={toasts} onDismiss={dismissToast} />
        </ToastContext.Provider>
    );
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
    return (
        <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
            <AnimatePresence mode="popLayout">
                {toasts.map(toast => {
                    const Icon = TOAST_ICONS[toast.type];
                    const color = TOAST_COLORS[toast.type];

                    return (
                        <motion.div
                            key={toast.id}
                            initial={{ opacity: 0, y: 20, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, x: 100, scale: 0.95 }}
                            className={`pointer-events-auto px-4 py-3 flex items-center gap-3 min-w-[280px] max-w-[400px] backdrop-blur-xl rounded-2xl border ${
                                toast.type === 'success'
                                    ? 'bg-[var(--color-success)]/85 border-[var(--color-success)]/30 text-white'
                                    : toast.type === 'error'
                                    ? 'bg-[var(--color-bg-secondary)] border-[var(--color-error)]/30'
                                    : toast.type === 'warning'
                                    ? 'bg-[var(--color-bg-secondary)] border-[var(--color-warning)]/30'
                                    : 'bg-[var(--glass-bg)] border-[var(--glass-border)]'
                            } shadow-lg`}
                            style={{ borderLeft: `3px solid ${color}` }}
                        >
                            <div
                                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                                style={{ backgroundColor: `${color}15` }}
                            >
                                <Icon className="w-4 h-4" style={{ color }} />
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-medium text-[var(--text-primary)]">{toast.message}</p>
                            </div>
                            {toast.action && (
                                <div className="flex-shrink-0">
                                    {toast.action}
                                </div>
                            )}
                            <button
                                onClick={() => onDismiss(toast.id)}
                                className="p-1 rounded-full transition-colors flex-shrink-0 hover:bg-[var(--glass-bg)]"
                            >
                                <X className="w-4 h-4 text-[var(--text-tertiary)]" />
                            </button>
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}
