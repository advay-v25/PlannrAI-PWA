import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Undo2, X } from 'lucide-react';
import { LiquidGlassButton } from '@/components/ui/liquid-glass-button';

interface UndoToastProps {
    isOpen: boolean;
    onUndo: () => void;
    onDismiss: () => void;
    message: string;
    durationMs?: number;
}

export function UndoToast({ isOpen, onUndo, onDismiss, message, durationMs = 10000 }: UndoToastProps) {
    const [timeLeft, setTimeLeft] = useState(durationMs);

    useEffect(() => {
        if (!isOpen) return;

        setTimeLeft(durationMs);
        const interval = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 100) {
                    clearInterval(interval);
                    onDismiss();
                    return 0;
                }
                return prev - 100;
            });
        }, 100);

        return () => clearInterval(interval);
    }, [isOpen, durationMs, onDismiss]);

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0, y: 50, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 20, scale: 0.9 }}
                    className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] w-full max-w-sm"
                >
                    <div className="bg-[var(--color-bg-secondary)] border border-[var(--glass-border)] rounded-2xl shadow-2xl p-4 flex flex-col gap-3 backdrop-blur-xl relative overflow-hidden">
                        {/* Progress Bar */}
                        <div className="absolute top-0 left-0 w-full h-1 bg-[var(--glass-border)]">
                            <motion.div
                                className="h-full bg-[var(--color-primary)]"
                                initial={{ width: '100%' }}
                                animate={{ width: `${(timeLeft / durationMs) * 100}%` }}
                                transition={{ duration: 0.1, ease: 'linear' }}
                            />
                        </div>

                        <div className="flex items-start justify-between gap-4 mt-1">
                            <p className="text-sm font-medium text-[var(--text-primary)]">
                                {message}
                            </p>
                            <button
                                onClick={onDismiss}
                                className="p-1 rounded-full hover:bg-[var(--glass-bg)] text-[var(--text-tertiary)] transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <LiquidGlassButton
                            onClick={() => {
                                onUndo();
                                onDismiss();
                            }}
                            variant="secondary"
                            className="w-full justify-center"
                            size="sm"
                        >
                            <Undo2 className="w-4 h-4 mr-2" />
                            Undo Change
                        </LiquidGlassButton>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
