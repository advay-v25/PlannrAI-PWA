'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Plus, Trash2, Edit3, Loader2, X, Check, ToggleRight, ToggleLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

interface PersonalRule {
    id: string;
    rule: string;
    category: string;
    is_hard_rule: boolean;
    is_active: boolean;
    times_applied: number;
    times_violated: number;
    source_review_id: string | null;
    created_at: string;
}

const CATEGORIES = ['scheduling', 'energy', 'productivity', 'habit', 'mindset'] as const;

export default function PersonalRulesManager() {
    const supabase = createClient();
    const [rules, setRules] = useState<PersonalRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);

    // Form
    const [ruleText, setRuleText] = useState('');
    const [category, setCategory] = useState<string>('scheduling');
    const [isHard, setIsHard] = useState(false);

    useEffect(() => { loadRules(); }, []);

    const loadRules = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
            .from('personal_rules')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });
        setRules(data || []);
        setLoading(false);
    };

    const resetForm = () => {
        setRuleText(''); setCategory('scheduling'); setIsHard(false); setIsAdding(false);
    };

    const handleAdd = async () => {
        if (!ruleText.trim()) { toast.error('Enter a rule'); return; }
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        await supabase.from('personal_rules').insert({
            user_id: user.id,
            rule: ruleText.trim(),
            category,
            is_hard_rule: isHard,
            is_active: true
        });
        toast.success('Rule added');
        resetForm();
        loadRules();
    };

    const toggleActive = async (id: string, current: boolean) => {
        await supabase.from('personal_rules').update({ is_active: !current }).eq('id', id);
        loadRules();
    };

    const handleDelete = async (id: string) => {
        await supabase.from('personal_rules').delete().eq('id', id);
        toast.success('Rule deleted');
        loadRules();
    };

    const categoryColors: Record<string, string> = {
        scheduling: 'text-cyan-400 bg-cyan-500/10',
        energy: 'text-amber-400 bg-amber-500/10',
        productivity: 'text-emerald-400 bg-emerald-500/10',
        habit: 'text-violet-400 bg-violet-500/10',
        mindset: 'text-pink-400 bg-pink-500/10',
    };

    if (loading) {
        return (
            <div className="space-y-6 animate-pulse">
                <div className="flex justify-between items-center">
                    <div className="h-8 w-48 bg-[var(--glass-border)] rounded-md"></div>
                    <div className="h-10 w-32 bg-[var(--glass-border)] rounded-lg"></div>
                </div>
                <div className="space-y-4">
                    <div className="h-32 w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-2xl"></div>
                    <div className="h-32 w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-2xl"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">Personal Rules</h2>
                    <p className="text-sm text-[var(--text-tertiary)] mt-1">Rules that guide how AI schedules your time</p>
                </div>
                {!isAdding && (
                    <button
                        onClick={() => setIsAdding(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold
                            bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 text-[var(--color-primary)]
                            hover:bg-[var(--color-primary)]/20 transition-all"
                    >
                        <Plus className="w-3 h-3" /> Add Rule
                    </button>
                )}
            </div>

            {/* Add Form */}
            <AnimatePresence>
                {isAdding && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4"
                    >
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-[var(--text-primary)]">New Rule</h3>
                            <button onClick={resetForm} className="text-white/30 hover:text-white transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <input
                            value={ruleText}
                            onChange={e => setRuleText(e.target.value)}
                            placeholder='e.g. "Gym must be before noon"'
                            className="w-full px-3 py-2.5 text-sm bg-white/5 border border-white/10 rounded-xl
                                text-white placeholder:text-white/25 outline-none focus:border-[var(--color-primary)]/30 transition-all"
                        />
                        <div className="space-y-1.5">
                            <label className="text-[10px] text-white/40 uppercase tracking-wider">Category</label>
                            <div className="flex flex-wrap gap-1.5">
                                {CATEGORIES.map(cat => (
                                    <button
                                        key={cat}
                                        onClick={() => setCategory(cat)}
                                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold capitalize transition-all ${category === cat
                                                ? categoryColors[cat] || 'text-[var(--text-primary)] bg-[var(--glass-bg)]'
                                                : 'bg-white/5 border border-white/10 text-white/40 hover:bg-white/10'
                                            }`}
                                    >
                                        {cat}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)]">
                            <div>
                                <p className="text-xs font-bold text-[var(--text-primary)]">Hard Rule</p>
                                <p className="text-[10px] text-[var(--text-tertiary)]">AI must follow this strictly, not just as a suggestion</p>
                            </div>
                            <button onClick={() => setIsHard(!isHard)}>
                                {isHard
                                    ? <ToggleRight className="w-8 h-8 text-[var(--color-primary)]" />
                                    : <ToggleLeft className="w-8 h-8 text-white/20" />
                                }
                            </button>
                        </div>
                        <button
                            onClick={handleAdd}
                            className="w-full py-2.5 rounded-xl text-sm font-bold bg-[var(--color-primary)] text-white
                                hover:brightness-110 transition-all"
                        >
                            <Check className="w-3.5 h-3.5 inline mr-1.5" /> Add Rule
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Rules List */}
            <div className="space-y-3">
                {rules.length === 0 && !isAdding && (
                    <div className="text-center py-12 border border-white/5 rounded-2xl bg-white/[0.02]">
                        <Shield className="w-10 h-10 text-white/20 mx-auto mb-3" />
                        <p className="text-sm text-white/40">No personal rules yet</p>
                        <p className="text-xs text-white/20 mt-1">Add rules from Weekly Review or manually here</p>
                    </div>
                )}
                {rules.map(r => (
                    <motion.div
                        key={r.id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`rounded-xl border p-4 ${r.is_active ? 'border-white/5 bg-white/[0.03]' : 'border-white/[0.02] bg-white/[0.01] opacity-50'
                            }`}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <Shield className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                                    <span className="text-sm font-medium text-[var(--text-primary)]">&quot;{r.rule}&quot;</span>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${categoryColors[r.category] || 'text-white/40 bg-white/5'}`}>
                                        {r.category}
                                    </span>
                                    {r.is_hard_rule && (
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-red-400 bg-red-500/10">Hard Rule</span>
                                    )}
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.is_active ? 'text-emerald-400 bg-emerald-500/10' : 'text-white/30 bg-white/5'}`}>
                                        {r.is_active ? 'Active' : 'Disabled'}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 mt-2 text-[10px] text-white/30">
                                    <span>Applied: {r.times_applied}×</span>
                                    <span>Violated: {r.times_violated}×</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => toggleActive(r.id, r.is_active)}
                                    className="p-1.5 rounded-lg text-white/30 hover:text-amber-400 hover:bg-amber-500/10 transition-all"
                                    title={r.is_active ? 'Disable' : 'Enable'}
                                >
                                    {r.is_active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                                </button>
                                <button
                                    onClick={() => handleDelete(r.id)}
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
