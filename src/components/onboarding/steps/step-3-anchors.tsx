'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOnboardingStore, OnboardingCommitment } from '@/stores';
import { X, Plus, Calendar } from 'lucide-react';

const TEMPLATES = [
    { title: '🏢 Work', start_time: '09:00', end_time: '17:00', days_of_week: [1, 2, 3, 4, 5] },
    { title: '🎓 College', start_time: '09:00', end_time: '15:00', days_of_week: [1, 2, 3, 4, 5] }
];

const DAYS = [
    { id: 1, label: 'Mon' }, { id: 2, label: 'Tue' }, { id: 3, label: 'Wed' },
    { id: 4, label: 'Thu' }, { id: 5, label: 'Fri' }, { id: 6, label: 'Sat' }, { id: 0, label: 'Sun' }
];

export function Step3Anchors() {
    const { data, updateData } = useOnboardingStore();
    const [isAdding, setIsAdding] = useState(false);
    const [newComm, setNewComm] = useState<Partial<OnboardingCommitment>>({
        title: '', start_time: '09:00', end_time: '17:00', days_of_week: [1, 2, 3, 4, 5]
    });

    const addCommitment = (comm: OnboardingCommitment) => {
        updateData({ commitments: [...data.commitments, comm] });
    };

    const removeCommitment = (index: number) => {
        const next = [...data.commitments];
        next.splice(index, 1);
        updateData({ commitments: next });
    };

    const toggleDay = (dayId: number) => {
        const days = newComm.days_of_week || [];
        if (days.includes(dayId)) {
            setNewComm({ ...newComm, days_of_week: days.filter(d => d !== dayId) });
        } else {
            setNewComm({ ...newComm, days_of_week: [...days, dayId].sort() });
        }
    };

    const handleSaveNew = () => {
        if (!newComm.title || !newComm.start_time || !newComm.end_time || !newComm.days_of_week?.length) return;
        addCommitment(newComm as OnboardingCommitment);
        setIsAdding(false);
        setNewComm({ title: '', start_time: '09:00', end_time: '17:00', days_of_week: [1, 2, 3, 4, 5] });
    };

    return (
        <div className="flex flex-col items-center justify-start space-y-6 w-full max-w-lg mx-auto pb-10">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center">
                <h2 className="text-3xl font-bold tracking-tight text-white font-mono">
                    YOUR LOCKED <span className="text-[var(--color-primary)]">COMMITMENTS</span>
                </h2>
                <p className="text-[var(--color-text-secondary)] mt-1">
                    What are your non-negotiable recurring time blocks?
                </p>
            </motion.div>

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="w-full space-y-6">
                
                {/* Templates */}
                <div className="space-y-3">
                    <p className="text-sm font-mono text-[var(--color-text-tertiary)] uppercase text-center">Quick Templates</p>
                    <div className="grid grid-cols-2 gap-3">
                        {TEMPLATES.map((t, i) => (
                            <button
                                key={i}
                                onClick={() => addCommitment(t)}
                                className="p-4 rounded-xl bg-[var(--glass-surface)] border border-[var(--glass-border)] hover:bg-[var(--color-primary)]/10 hover:border-[var(--color-primary)]/30 text-left transition-all group"
                            >
                                <div className="font-bold text-white group-hover:text-[var(--color-primary)]">{t.title}</div>
                                <div className="text-xs text-[var(--color-text-tertiary)] mt-1">
                                    {t.start_time} - {t.end_time} • Mon-Fri
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="h-px bg-[var(--glass-border)] w-full my-6 rounded-full" />

                {/* List */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold text-white tracking-widest font-mono">YOUR COMMITMENTS</h3>
                        <div className="text-xs text-[var(--color-text-tertiary)] bg-[var(--glass-surface)] px-2 py-1 rounded">
                            {data.commitments.length} blocks
                        </div>
                    </div>

                    <div className="space-y-2">
                        <AnimatePresence>
                            {data.commitments.length === 0 && !isAdding && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center p-6 border border-dashed border-[var(--glass-border)] rounded-xl text-[var(--color-text-tertiary)]">
                                    No locked commitments added yet.
                                </motion.div>
                            )}

                            {data.commitments.map((c, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="bg-[var(--glass-surface)] border border-[var(--glass-border)] p-4 rounded-xl flex items-center justify-between group overflow-hidden"
                                >
                                    <div>
                                        <div className="font-bold text-white text-lg">{c.title}</div>
                                        <div className="text-sm text-[var(--color-text-secondary)] mt-1 flex items-center gap-2">
                                            <Calendar className="w-3 h-3" />
                                            {c.days_of_week.map(d => DAYS.find(x => x.id === d)?.label).join(', ')}
                                        </div>
                                        <div className="text-sm text-[var(--color-text-tertiary)]">{c.start_time} - {c.end_time}</div>
                                    </div>
                                    <button onClick={() => removeCommitment(i)} className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/20 rounded-lg transition-colors">
                                        <X className="w-5 h-5" />
                                    </button>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>

                    {/* Add Form */}
                    <AnimatePresence>
                        {isAdding ? (
                            <motion.div
                                initial={{ opacity: 0, y: 10, height: 0 }}
                                animate={{ opacity: 1, y: 0, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="bg-[var(--bg-card)] border border-[var(--glass-border)] p-4 rounded-xl space-y-4 overflow-hidden"
                            >
                                <input
                                    placeholder="Commitment Title (e.g. Work)"
                                    value={newComm.title}
                                    onChange={e => setNewComm({ ...newComm, title: e.target.value })}
                                    className="w-full bg-[var(--glass-surface)] border border-[var(--glass-border)] p-3 rounded-lg text-white"
                                    autoFocus
                                />
                                <div className="grid grid-cols-2 gap-3">
                                    <input
                                        type="time"
                                        value={newComm.start_time}
                                        onChange={e => setNewComm({ ...newComm, start_time: e.target.value })}
                                        className="w-full bg-[var(--glass-surface)] border border-[var(--glass-border)] p-3 rounded-lg text-white"
                                    />
                                    <input
                                        type="time"
                                        value={newComm.end_time}
                                        onChange={e => setNewComm({ ...newComm, end_time: e.target.value })}
                                        className="w-full bg-[var(--glass-surface)] border border-[var(--glass-border)] p-3 rounded-lg text-white"
                                    />
                                </div>
                                <div className="flex gap-1 justify-between">
                                    {DAYS.map(d => (
                                        <button
                                            key={d.id}
                                            onClick={() => toggleDay(d.id)}
                                            className={`flex-1 py-2 text-xs font-mono rounded-lg border transition-colors ${
                                                newComm.days_of_week?.includes(d.id) 
                                                ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-black' 
                                                : 'bg-transparent border-[var(--glass-border)] text-gray-400 hover:text-white'
                                            }`}
                                        >
                                            {d.label}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex gap-2 pt-2">
                                    <button onClick={() => setIsAdding(false)} className="flex-1 py-3 text-sm font-bold text-gray-400 hover:text-white border border-[var(--glass-border)] rounded-lg">
                                        Cancel
                                    </button>
                                    <button onClick={handleSaveNew} disabled={!newComm.title} className="flex-1 py-3 text-sm font-bold bg-[var(--color-primary)] text-black rounded-lg disabled:opacity-50">
                                        Save Block
                                    </button>
                                </div>
                            </motion.div>
                        ) : (
                            <button onClick={() => setIsAdding(true)} className="w-full py-4 border border-dashed border-[var(--glass-border)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 rounded-xl flex items-center justify-center gap-2 text-gray-400 hover:text-[var(--color-primary)] transition-all mt-4 font-mono text-sm group">
                                <Plus className="w-4 h-4 group-hover:scale-125 transition-transform" /> Add Custom Commitment
                            </button>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        </div>
    );
}
