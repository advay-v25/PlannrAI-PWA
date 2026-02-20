import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, Check, X, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConflictError } from '@/hooks/use-calendar';

interface ConflictModalProps {
    error: ConflictError | null;
    onClose: () => void;
    onConfirmOption: (option: any) => void;
}

export function ConflictModal({ error, onClose, onConfirmOption }: ConflictModalProps) {
    if (!error || !error.conflict) return null;

    // The backend `ConflictService` returns `resolution_options`.
    // We expect the options array to look like:
    // [ { strategy: "shift", changes: [ { id, start_time, end_time, title } ] }, ... ]

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 20 }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full max-w-lg bg-[#111] border border-red-500/20 rounded-2xl shadow-2xl overflow-hidden"
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
                            error.options.map((opt, i) => (
                                <button
                                    key={i}
                                    onClick={() => onConfirmOption(opt)}
                                    className="w-full text-left p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/10 transition-all group"
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="font-bold text-white text-sm">
                                            {opt.strategy === 'shift' && 'Shift Existing Blocks Down'}
                                            {opt.strategy === 'shrink' && 'Shrink New Block'}
                                            {opt.strategy === 'cancel' && 'Cancel Operation'}
                                            {!['shift', 'shrink', 'cancel'].includes(opt.strategy) && opt.strategy}
                                        </div>
                                        <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <ArrowRight className="w-3 h-3 text-white" />
                                        </div>
                                    </div>

                                    {/* Preview Changes */}
                                    {opt.changes && opt.changes.length > 0 && (
                                        <div className="space-y-1 mt-3 pl-3 border-l-2 border-white/10">
                                            {opt.changes.map((change: any, cIdx: number) => (
                                                <div key={cIdx} className="text-xs flex items-center gap-2">
                                                    <span className="text-white/40 truncate max-w-[120px]">
                                                        {change.title}
                                                    </span>
                                                    <span className="text-white/20">→</span>
                                                    <span className="font-mono text-[10px] text-white/60 bg-white/5 px-1.5 py-0.5 rounded">
                                                        {change.start_time} - {change.end_time}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </button>
                            ))
                        ) : (
                            <div className="p-4 text-center">
                                <p className="text-sm text-white/40 mb-4">No automatic resolution available.</p>
                                <button
                                    onClick={onClose}
                                    className="px-6 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium text-sm transition-colors"
                                >
                                    Cancel Changes
                                </button>
                            </div>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
