'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOnboardingStore, OnboardingCommitment } from '@/stores';
import { X, Plus, Calendar, Clock } from 'lucide-react';

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

    const commitments = data.commitments || [];

    const addCommitment = (comm: OnboardingCommitment) => {
        updateData({ commitments: [...commitments, comm] });
    };

    const removeCommitment = (index: number) => {
        const next = [...commitments];
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
        <div className="flex flex-col items-center justify-start space-y-8 w-full max-w-xl mx-auto pb-24">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3 text-center">
                <h2 className="text-3xl font-bold tracking-tight text-[var(--text-primary)] font-mono uppercase">
                    LOCKED <span className="text-[var(--color-primary)]">ANCHORS</span>
                </h2>
                <p className="text-[var(--text-primary)]/60 tracking-wide text-sm">
                    What are your non-negotiable recurring time blocks?
                </p>
            </motion.div>

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="w-full space-y-10 mt-4">
                
                {/* Templates */}
                <div className="space-y-5 bg-[var(--glass-bg)] border border-[var(--glass-border)] p-7 rounded-3xl backdrop-blur-md shadow-lg">
                    <p className="flex items-center gap-3 text-lg font-bold text-[var(--text-primary)] uppercase tracking-widest border-b border-[var(--glass-border)] pb-4">
                        <span className="text-2xl drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">⚡</span> Quick Templates
                    </p>
                    <div className="grid grid-cols-2 gap-5">
                        {TEMPLATES.map((t, i) => (
                            <button
                                key={i}
                                onClick={() => addCommitment(t)}
                                className="p-6 rounded-2xl bg-[var(--glass-bg-active)] border border-[var(--glass-border)] hover:bg-[var(--glass-bg)] hover:scale-[1.03] hover:border-[var(--glass-border)] text-left transition-all duration-300 group shadow-inner"
                            >
                                <div className="font-bold text-lg text-[var(--text-primary)] tracking-wide group-hover:text-[var(--color-primary)] transition-colors drop-shadow-md">{t.title}</div>
                                <div className="text-xs text-[var(--text-primary)]/50 mt-2 font-mono tracking-wider flex items-center gap-1.5 opacity-80">
                                    <Clock className="w-3 h-3" /> {t.start_time} - {t.end_time}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* List */}
                <div className="space-y-6">
                    <div className="flex items-center justify-between px-2">
                        <h3 className="text-sm font-bold text-[var(--text-primary)]/80 tracking-widest uppercase">Your Commitments</h3>
                        <div className="text-[10px] font-black tracking-[0.2em] text-black bg-white px-3 py-1.5 rounded-full shadow-[0_0_15px_rgba(255,255,255,0.4)]">
                            {commitments.length} BLOCKS
                        </div>
                    </div>

                    <div className="space-y-4">
                        <AnimatePresence>
                            {commitments.length === 0 && !isAdding && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center p-10 border-2 border-dashed border-[var(--glass-border)] rounded-3xl text-[var(--text-primary)]/40 text-sm font-medium tracking-wide bg-white/[0.02]">
                                    No locked commitments added yet.
                                </motion.div>
                            )}

                            {commitments.map((c, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, height: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, height: 'auto', scale: 1 }}
                                    exit={{ opacity: 0, height: 0, scale: 0.9 }}
                                    className="bg-[var(--glass-bg)] border border-[var(--glass-border)] p-6 rounded-3xl flex items-center justify-between group overflow-hidden backdrop-blur-md hover:bg-white/[0.08] hover:border-[var(--glass-border)] transition-all shadow-lg"
                                >
                                    <div className="space-y-2">
                                        <div className="font-black text-[var(--text-primary)] text-xl tracking-tight drop-shadow-md">{c.title}</div>
                                        <div className="text-xs text-[var(--color-primary)] flex items-center gap-2 font-bold tracking-widest uppercase">
                                            <Calendar className="w-4 h-4" />
                                            {c.days_of_week.map(d => DAYS.find(x => x.id === d)?.label).join(', ')}
                                        </div>
                                        <div className="text-xs text-[var(--text-primary)]/50 font-mono tracking-widest flex items-center gap-1.5">
                                            <Clock className="w-3.5 h-3.5 opacity-70" /> {c.start_time} - {c.end_time}
                                        </div>
                                    </div>
                                    <button onClick={() => removeCommitment(i)} className="p-3.5 text-[var(--text-primary)]/30 hover:text-red-400 hover:bg-red-400/20 rounded-full transition-all bg-[var(--glass-bg-active)] hover:scale-110 active:scale-95 border border-transparent hover:border-red-400/30">
                                        <X className="w-5 h-5 stroke-[2.5]" />
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
                                exit={{ opacity: 0, height: 0, scale: 0.95 }}
                                className="bg-[var(--glass-bg-active)] border border-[var(--color-primary)]/30 p-7 rounded-3xl space-y-6 overflow-hidden backdrop-blur-xl shadow-[0_0_30px_rgba(var(--color-primary-rgb),0.15)] mt-4"
                            >
                                <div className="space-y-4">
                                    <label className="text-[10px] font-bold text-[var(--color-primary)] uppercase tracking-widest pl-1">Block Title</label>
                                    <input
                                        placeholder="e.g. Deep Work, Gym, Class"
                                        value={newComm.title}
                                        onChange={e => setNewComm({ ...newComm, title: e.target.value })}
                                        className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] p-5 rounded-2xl text-[var(--text-primary)] text-lg focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all font-bold placeholder:text-[var(--text-primary)]/20 placeholder:font-normal"
                                        autoFocus
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-5">
                                    <div className="space-y-3 relative">
                                        <label className="text-[10px] font-bold text-[var(--color-primary)] uppercase tracking-widest pl-1">Start Time</label>
                                        <input
                                            type="time"
                                            value={newComm.start_time}
                                            onChange={e => setNewComm({ ...newComm, start_time: e.target.value })}
                                            className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] p-4 rounded-2xl text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-primary)] transition-all font-mono tracking-wider text-base"
                                        />
                                    </div>
                                    <div className="space-y-3 relative">
                                        <label className="text-[10px] font-bold text-[var(--color-primary)] uppercase tracking-widest pl-1">End Time</label>
                                        <input
                                            type="time"
                                            value={newComm.end_time}
                                            onChange={e => setNewComm({ ...newComm, end_time: e.target.value })}
                                            className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] p-4 rounded-2xl text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-primary)] transition-all font-mono tracking-wider text-base"
                                        />
                                    </div>
                                </div>
                                
                                <div className="space-y-3 pt-2">
                                    <label className="text-[10px] font-bold text-[var(--color-primary)] uppercase tracking-widest pl-1">Active Days</label>
                                    <div className="flex gap-2 justify-between">
                                        {DAYS.map(d => (
                                            <button
                                                key={d.id}
                                                onClick={() => toggleDay(d.id)}
                                                className={`flex-1 py-3 text-xs font-bold rounded-xl border transition-all duration-300 ${
                                                    newComm.days_of_week?.includes(d.id) 
                                                    ? 'bg-white text-black border-transparent shadow-[0_0_15px_rgba(255,255,255,0.4)] scale-110 z-10' 
                                                    : 'bg-[var(--glass-bg-active)] border-[var(--glass-border)] text-[var(--text-primary)]/40 hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)] hover:border-[var(--glass-border)]'
                                                }`}
                                            >
                                                {d.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex gap-4 pt-6">
                                    <button onClick={() => setIsAdding(false)} className="flex-[0.4] py-4 text-xs font-bold uppercase tracking-widest text-[var(--text-primary)]/50 hover:text-[var(--text-primary)] border border-[var(--glass-border)] rounded-2xl hover:bg-[var(--glass-bg)] hover:border-[var(--glass-border)] transition-all bg-[var(--glass-bg-active)]">
                                        Cancel
                                    </button>
                                    <button onClick={handleSaveNew} disabled={!newComm.title} className="flex-1 py-4 text-sm font-black uppercase tracking-widest bg-[var(--color-primary)] text-black rounded-2xl disabled:opacity-50 disabled:grayscale hover:scale-[1.02] active:scale-95 transition-all shadow-[0_0_20px_rgba(var(--color-primary-rgb),0.3)]">
                                        Lock Block
                                    </button>
                                </div>
                            </motion.div>
                        ) : (
                            <button onClick={() => setIsAdding(true)} className="w-full py-8 mt-4 border border-dashed border-[var(--glass-border)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)]/[0.03] rounded-3xl flex items-center justify-center gap-3 text-[var(--text-primary)]/40 hover:text-[var(--text-primary)] transition-all duration-300 font-bold text-sm group tracking-widest uppercase">
                                <Plus className="w-5 h-5 group-hover:scale-125 transition-transform duration-300 group-hover:text-[var(--color-primary)]" strokeWidth={3} /> Add Custom Commitment
                            </button>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        </div>
    );
}
