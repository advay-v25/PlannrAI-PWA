import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, Check, X, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LiquidGlassButton } from '@/components/ui/liquid-glass-button';
import type { ConflictError } from '@/hooks/use-calendar';
import type { Patch } from '@/lib/ai/schemas';

export interface CalendarOption {
    id: string;
    label: string;
    description: string;
    tradeoff: string;
    patch: Patch;
}

interface ConflictModalProps {
    error: ConflictError | null;
    onClose: () => void;
    onConfirmOption: (option: CalendarOption) => void;
}

export function ConflictModal({ error, onClose, onConfirmOption }: ConflictModalProps) {
    if (!error || !error.conflict) return null;

    // The backend `resolve-conflict` API returns an array of `CalendarOption`.
    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xl p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 20 }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full max-w-lg glass-panel-elevated rounded-2xl shadow-2xl overflow-hidden"
                >
                    {/* Header */}
                    <div className="bg-red-500/10 p-5 flex items-start gap-4 border-b border-red-500/20">
                        <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
                            <ShieldAlert className="w-5 h-5 text-red-400" />
                        </div>
                        <div className="flex-1">
                            <h2 className="text-lg font-bold text-white tracking-tight leading-tight">
                                Schedule Conflict Detected
                            </h2>
                            <p className="text-sm text-red-200/70 mt-1">
                                Your requested action overlaps with an existing block on your schedule.
                                Choose how to proceed.
                            </p>
                        </div>
                        <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/5 text-white/40">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Options List */}
                    <div className="p-5 max-h-[60vh] overflow-y-auto no-scrollbar space-y-3">
                        {error.options?.length > 0 ? (
                            error.options.map((opt: CalendarOption, i: number) => (
                                <button
                                    key={i}
                                    onClick={() => onConfirmOption(opt)}
                                    className="w-full text-left p-4 rounded-xl glass-panel hover:bg-white/[0.08] hover:border-white/[0.15] transition-all duration-300 hover:scale-[1.02] group"
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="font-bold text-white text-sm">
                                            {opt.label}
                                        </div>
                                        <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <ArrowRight className="w-3 h-3 text-white" />
                                        </div>
                                    </div>
                                    <p className="text-xs text-white/70 mb-2">{opt.description}</p>
                                    <p className="text-[10px] text-white/50 italic">Tradeoff: {opt.tradeoff}</p>

                                    {/* Preview Changes Count */}
                                    <div className="mt-2 flex gap-2">
                                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-white/40">
                                            {opt.patch?.ops?.length || 0} Block Changes
                                        </span>
                                    </div>
                                </button>
                            ))
                        ) : (
                            <div className="p-4 text-center flex flex-col items-center">
                                <p className="text-sm text-white/40 mb-4">No automatic resolution available.</p>
                                <LiquidGlassButton
                                    onClick={onClose}
                                    variant="ghost"
                                    size="md"
                                >
                                    Cancel Changes
                                </LiquidGlassButton>
                            </div>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
