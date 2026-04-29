'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Plus, Trash2, Edit3, Clock, Loader2, X, Check } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

interface Commitment {
    id: string;
    title: string;
    start_time: string;
    end_time: string;
    days_of_week: number[];
    is_active: boolean;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_NUM_MAP: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };

export default function CommitmentsManager() {
    const supabase = createClient();
    const [commitments, setCommitments] = useState<Commitment[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);

    // Form
    const [title, setTitle] = useState('');
    const [startTime, setStartTime] = useState('09:00');
    const [endTime, setEndTime] = useState('17:00');
    const [days, setDays] = useState<string[]>([]);

    useEffect(() => { loadCommitments(); }, []);

    const loadCommitments = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
            .from('commitments')
            .select('*')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .order('start_time');
        setCommitments(data || []);
        setLoading(false);
    };

    const resetForm = () => {
        setTitle(''); setStartTime('09:00'); setEndTime('17:00'); setDays([]);
        setIsAdding(false); setEditId(null);
    };

    const toggleDay = (day: string) => {
        setDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
    };

    const handleSave = async () => {
        if (!title.trim() || days.length === 0) {
            toast.error('Enter a title and select days');
            return;
        }
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const payload = {
            user_id: user.id,
            title: title.trim(),
            start_time: startTime,
            end_time: endTime,
            days_of_week: days.map(d => DAY_NUM_MAP[d]),
            is_active: true
        };

        let err = null;
        if (editId) {
            const res = await supabase.from('commitments').update(payload).eq('id', editId);
            err = res.error;
            if (!err) toast.success('Commitment updated');
        } else {
            const res = await supabase.from('commitments').insert(payload);
            err = res.error;
            if (!err) toast.success('Commitment added');
        }

        if (err) {
            toast.error(err.message || 'Failed to save commitment');
            return;
        }

        resetForm();
        loadCommitments();
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('calendar-refresh'));
    };

    const handleDelete = async (id: string) => {
        const { error } = await supabase.from('commitments').update({ is_active: false }).eq('id', id);
        if (error) {
            toast.error(error.message || 'Failed to remove commitment');
            return;
        }
        toast.success('Commitment removed');
        loadCommitments();
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('calendar-refresh'));
    };

    const startEdit = (c: any) => {
        setEditId(c.id);
        setTitle(c.title);
        setStartTime(c.start_time);
        setEndTime(c.end_time);
        setDays((c.days_of_week || []).map((d: number) => {
            const entry = Object.entries(DAY_NUM_MAP).find(([, v]) => v === d);
            return entry ? entry[0] : '';
        }).filter(Boolean));
        setIsAdding(true);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary)]" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-white tracking-tight">Commitments</h2>
                    <p className="text-sm text-white/40 mt-1">Locked blocks that AI cannot move</p>
                </div>
                {!isAdding && (
                    <button
                        onClick={() => setIsAdding(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold
                            bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 text-[var(--color-primary)]
                            hover:bg-[var(--color-primary)]/20 transition-all"
                    >
                        <Plus className="w-3 h-3" /> Add New
                    </button>
                )}
            </div>

            {/* Add / Edit Form */}
            <AnimatePresence>
                {isAdding && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4"
                    >
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-white">{editId ? 'Edit' : 'New'} Commitment</h3>
                            <button onClick={resetForm} className="text-white/30 hover:text-white transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <input
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            placeholder="e.g. Work, Therapy, Team Standup"
                            className="w-full px-3 py-2.5 text-sm bg-white/5 border border-white/10 rounded-xl
                                text-white placeholder:text-white/25 outline-none focus:border-[var(--color-primary)]/30 transition-all"
                        />
                        <div className="flex gap-3">
                            <div className="flex-1 space-y-1">
                                <label className="text-[10px] text-white/40 uppercase tracking-wider">Start</label>
                                <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                                    className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white outline-none" />
                            </div>
                            <div className="flex-1 space-y-1">
                                <label className="text-[10px] text-white/40 uppercase tracking-wider">End</label>
                                <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                                    className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white outline-none" />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] text-white/40 uppercase tracking-wider">Days</label>
                            <div className="flex gap-1.5">
                                {DAYS.map(day => (
                                    <button
                                        key={day}
                                        onClick={() => toggleDay(day)}
                                        className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${days.includes(day)
                                                ? 'bg-[var(--color-primary)] text-white'
                                                : 'bg-white/5 border border-white/10 text-white/40 hover:bg-white/10'
                                            }`}
                                    >
                                        {day}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <button
                            onClick={handleSave}
                            className="w-full py-2.5 rounded-xl text-sm font-bold bg-[var(--color-primary)] text-white
                                hover:brightness-110 transition-all"
                        >
                            <Check className="w-3.5 h-3.5 inline mr-1.5" />
                            {editId ? 'Update' : 'Add'} Commitment
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Commitment List */}
            <div className="space-y-3">
                {commitments.length === 0 && !isAdding && (
                    <div className="text-center py-12 border border-white/5 rounded-2xl bg-white/[0.02]">
                        <Lock className="w-10 h-10 text-white/20 mx-auto mb-3" />
                        <p className="text-sm text-white/40">No commitments yet</p>
                        <p className="text-xs text-white/20 mt-1">Add blocks that AI should never move</p>
                    </div>
                )}
                {commitments.map(c => (
                    <motion.div
                        key={c.id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-xl border border-white/5 bg-white/[0.03] p-4"
                    >
                        <div className="flex items-start justify-between">
                            <div>
                                <div className="flex items-center gap-2">
                                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                                    <h4 className="text-sm font-bold text-white uppercase tracking-wide">{c.title}</h4>
                                </div>
                                <div className="mt-1.5 space-y-0.5">
                                    <p className="text-xs text-white/40">
                                        {(c.days_of_week || []).map((d: number) => {
                                            const entry = Object.entries(DAY_NUM_MAP).find(([, v]) => v === d);
                                            return entry ? entry[0] : '';
                                        }).filter(Boolean).join(', ')}
                                    </p>
                                    <p className="text-xs text-white/40">
                                        {c.start_time} - {c.end_time}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <button
                                    onClick={() => startEdit(c)}
                                    className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/10 transition-all"
                                >
                                    <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    onClick={() => handleDelete(c.id)}
                                    className="p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
}
