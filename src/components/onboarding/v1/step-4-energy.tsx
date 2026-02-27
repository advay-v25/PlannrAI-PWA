'use client';

import { motion } from 'framer-motion';
import { useOnboardingStore } from '@/stores';
import { GlassCard } from '@/components/ui/glass-card';
import { Sun, Moon, Battery, Zap, Activity } from 'lucide-react';

const WINDOWS = [
    { id: 'morning', label: '06:00 - 10:00', icon: Sun },
    { id: 'midday', label: '10:00 - 14:00', icon: Zap },
    { id: 'afternoon', label: '14:00 - 18:00', icon: Battery },
    { id: 'evening', label: '18:00 - 22:00', icon: Moon },
];

export function Step4Energy() {
    const { data, updateData } = useOnboardingStore();

    const handleWindowToggle = (type: 'peak' | 'low', windowId: string) => {
        const currentList = type === 'peak' ? (data.peak_windows || []) : (data.low_windows || []);
        const otherList = type === 'peak' ? (data.low_windows || []) : (data.peak_windows || []);

        // Remove from the other list if it exists there
        if (otherList.includes(windowId)) {
            updateData({ [type === 'peak' ? 'low_windows' : 'peak_windows']: otherList.filter(w => w !== windowId) });
        }

        if (currentList.includes(windowId)) {
            updateData({ [type === 'peak' ? 'peak_windows' : 'low_windows']: currentList.filter(w => w !== windowId) });
        } else {
            // max 2 selections per type, queue style
            const newList = [...currentList, windowId].slice(-2);
            updateData({ [type === 'peak' ? 'peak_windows' : 'low_windows']: newList });
        }
    };

    return (
        <div className="flex flex-col items-center justify-center space-y-10 w-full max-w-2xl mx-auto py-8">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center space-y-4"
            >
                <h2 className="text-3xl font-bold font-mono text-white">Biological Mapping</h2>
                <p className="text-[var(--color-text-secondary)]">
                    Algorithms fail when they ignore your biology. Map your absolute highest and lowest cognitive periods.
                </p>
            </motion.div>

            <div className="w-full grid md:grid-cols-2 gap-8">
                {/* Peak Windows */}
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 }}
                    className="space-y-4"
                >
                    <div className="flex items-center gap-2 text-[var(--color-green)] mb-2">
                        <Zap size={20} />
                        <h3 className="font-mono uppercase text-sm tracking-wider">Peak Focus Windows (Max 2)</h3>
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                        {WINDOWS.map((win) => {
                            const Icon = win.icon;
                            const isSelected = (data.peak_windows || []).includes(win.id);
                            return (
                                <button
                                    key={`peak-\${win.id}`}
                                    onClick={() => handleWindowToggle('peak', win.id)}
                                    className={`flex items-center gap-4 p-4 rounded-xl border transition-all \${
                                        isSelected
                                            ? 'bg-[var(--color-green)] text-black border-[var(--color-green)] shadow-[0_0_15px_rgba(0,255,0,0.2)]'
                                            : 'bg-[var(--glass-surface)] border-[var(--glass-border)] hover:border-white/20 text-[var(--color-text-secondary)]'
                                    }`}
                                >
                                    <Icon size={20} className={isSelected ? 'text-black' : 'text-gray-400'} />
                                    <span className="font-mono text-sm">{win.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </motion.div>

                {/* Low Windows */}
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                    className="space-y-4"
                >
                    <div className="flex items-center gap-2 text-[var(--color-red)] mb-2">
                        <Battery size={20} />
                        <h3 className="font-mono uppercase text-sm tracking-wider">Low Energy Windows (Max 2)</h3>
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                        {WINDOWS.map((win) => {
                            const Icon = win.icon;
                            const isSelected = (data.low_windows || []).includes(win.id);
                            return (
                                <button
                                    key={`low-\${win.id}`}
                                    onClick={() => handleWindowToggle('low', win.id)}
                                    className={`flex items-center gap-4 p-4 rounded-xl border transition-all \${
                                        isSelected
                                            ? 'bg-[var(--color-red)] text-black border-[var(--color-red)] shadow-[0_0_15px_rgba(255,0,0,0.2)]'
                                            : 'bg-[var(--glass-surface)] border-[var(--glass-border)] hover:border-white/20 text-[var(--color-text-secondary)]'
                                    }`}
                                >
                                    <Icon size={20} className={isSelected ? 'text-black' : 'text-gray-400'} />
                                    <span className="font-mono text-sm">{win.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </motion.div>
            </div>

            {/* Work Style Toggle */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="w-full pt-8 border-t border-[var(--glass-border)]"
            >
                <h3 className="font-mono uppercase text-sm tracking-wider text-center text-[var(--color-text-tertiary)] mb-6">Execution Style</h3>
                <div className="grid grid-cols-2 gap-4">
                    <button
                        onClick={() => updateData({ work_style: 'sprinter' })}
                        className={`p-6 rounded-xl border transition-all flex flex-col items-center text-center gap-3 \${
                            data.work_style === 'sprinter'
                                ? 'bg-[var(--color-primary)]/20 border-[var(--color-primary)] text-white shadow-[0_0_20px_rgba(var(--color-primary-rgb),0.2)]'
                                : 'bg-[var(--glass-surface)] border-[var(--glass-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]/50'
                        }`}
                    >
                        <Zap size={24} className={data.work_style === 'sprinter' ? 'text-[var(--color-primary)]' : 'opacity-50'} />
                        <div>
                            <div className="font-mono font-bold mb-1">Sprinter</div>
                            <div className="text-xs opacity-70">Focus for 90-120 mins, then crash. Needs long breaks.</div>
                        </div>
                    </button>

                    <button
                        onClick={() => updateData({ work_style: 'marathoner' })}
                        className={`p-6 rounded-xl border transition-all flex flex-col items-center text-center gap-3 \${
                            data.work_style === 'marathoner'
                                ? 'bg-[var(--color-primary)]/20 border-[var(--color-primary)] text-white shadow-[0_0_20px_rgba(var(--color-primary-rgb),0.2)]'
                                : 'bg-[var(--glass-surface)] border-[var(--glass-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]/50'
                        }`}
                    >
                        <Activity size={24} className={data.work_style === 'marathoner' ? 'text-[var(--color-primary)]' : 'opacity-50'} />
                        <div>
                            <div className="font-mono font-bold mb-1">Marathoner</div>
                            <div className="text-xs opacity-70">Slow burn. Can go 3-4 hours steady with micro-breaks.</div>
                        </div>
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
