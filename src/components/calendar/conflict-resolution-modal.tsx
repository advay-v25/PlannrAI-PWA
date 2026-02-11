
import { motion } from 'framer-motion';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { AlertTriangle, ArrowRight, X } from 'lucide-react';
import type { ResolutionOption } from '@/lib/calendar/conflict-resolver';

interface ConflictResolutionModalProps {
    options: ResolutionOption[];
    onSelect: (option: ResolutionOption) => void;
    onCancel: () => void;
}

export function ConflictResolutionModal({ options, onSelect, onCancel }: ConflictResolutionModalProps) {
    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={onCancel}>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-md"
                onClick={e => e.stopPropagation()}
            >
                <GlassCard padding="lg" className="space-y-6 border-orange-500/20 shadow-[0_0_50px_rgba(249,115,22,0.1)]">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0">
                            <AlertTriangle className="w-6 h-6 text-orange-500" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold">Schedule Conflict</h3>
                            <p className="text-xs text-[var(--text-secondary)]">Overlapping blocks detected.</p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {options.map((opt) => (
                            <button
                                key={opt.id}
                                onClick={() => onSelect(opt)}
                                className="w-full text-left p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all group"
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="font-bold text-sm">{opt.label}</span>
                                    <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                                <p className="text-xs text-[var(--text-tertiary)]">{opt.description}</p>
                            </button>
                        ))}
                    </div>

                    <GlassButton variant="ghost" className="w-full" onClick={onCancel}>
                        Cancel Move
                    </GlassButton>
                </GlassCard>
            </motion.div>
        </div>
    );
}
