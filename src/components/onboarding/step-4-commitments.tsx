'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOnboardingStore } from '@/stores';
import { Plus, X, Anchor } from 'lucide-react';
import { CommitmentModal } from '@/components/goals/commitment-modal';

export function Step4Commitments() {
    const { data, addCommitment, removeCommitment } = useOnboardingStore();
    const [isAdding, setIsAdding] = useState(false);

    const handleCommitmentSuccess = (commitmentData: {
        title: string;
        start_time: string;
        end_time: string;
        days_of_week: number[];
    }) => {
        // Sync the saved commitment to the OnboardingStore for display
        addCommitment({
            ...commitmentData,
            is_active: true,
        });
    };

    return (
        <div className="h-full flex flex-col items-center w-full max-w-2xl mx-auto">
            <div className="text-center space-y-2 mb-8">
                <h2 className="text-3xl font-display font-light">Non-Negotiables</h2>
                <p className="text-[var(--color-text-secondary)] font-light">
                    Add fixed anchors like work, school, or recurring calls.
                </p>
            </div>

            {/* List */}
            <div className="flex-1 w-full overflow-y-auto min-h-[200px] space-y-3 pr-2 custom-scrollbar">
                {data.commitments.length === 0 ? (
                    <div className="h-40 flex flex-col items-center justify-center border border-dashed border-[var(--glass-border)] rounded-2xl opacity-50">
                        <Anchor className="w-8 h-8 mb-2 opacity-50" />
                        <p className="text-sm">No anchors set yet.</p>
                    </div>
                ) : (
                    data.commitments.map((c, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="bg-[var(--glass-bg)] border border-[var(--glass-border)] p-4 rounded-xl flex items-center justify-between group"
                        >
                            <div>
                                <h4 className="font-bold">{c.title}</h4>
                                <p className="text-xs text-[var(--text-tertiary)] font-mono">
                                    {c.start_time} - {c.end_time} • {c.days_of_week.length === 5 ? 'Weekdays' : c.days_of_week.length === 7 ? 'Every Day' : `${c.days_of_week.length} Days`}
                                </p>
                            </div>
                            <button
                                onClick={() => removeCommitment(i)}
                                className="p-2 hover:bg-white/10 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                            >
                                <X className="w-4 h-4 text-red-400" />
                            </button>
                        </motion.div>
                    ))
                )}
            </div>

            <div className="mt-6 w-full text-center space-y-4">
                <button
                    onClick={() => setIsAdding(true)}
                    className="w-full py-4 rounded-xl border border-dashed border-[var(--color-primary)] text-[var(--color-primary)] font-bold hover:bg-[var(--color-primary)]/10 transition-all flex items-center justify-center gap-2"
                >
                    <Plus className="w-5 h-5" /> Add Anchor
                </button>

                <p className="text-xs text-[var(--text-tertiary)]">
                    You can add more later. For now, just the big rocks.
                </p>
            </div>

            <AnimatePresence>
                {isAdding && (
                    <CommitmentModal
                        onClose={() => setIsAdding(false)}
                        onSuccess={handleCommitmentSuccess}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
