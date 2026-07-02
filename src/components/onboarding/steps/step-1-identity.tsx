'use client';

import { motion } from 'framer-motion';
import { useOnboardingStore } from '@/stores';
import { Input } from '@/components/ui/input';

export function Step1Identity() {
    const { data, updateData } = useOnboardingStore();

    return (
        <div className="flex flex-col items-center justify-center space-y-10 text-center w-full max-w-lg mx-auto pb-10">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="space-y-5 w-full"
            >
                <div className="space-y-4">
                    <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-[var(--text-primary)] font-mono">
                        INITIALIZE <span className="text-[var(--color-primary)]">Personal OS</span>
                    </h1>
                    <p className="text-[var(--text-primary)]/60 tracking-wider text-lg">
                        Your life deserves an operating system.
                    </p>
                </div>
                
                <div className="bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-2xl p-6 mt-8 text-sm text-left text-[var(--text-primary)]/50 w-full max-w-md mx-auto space-y-3 backdrop-blur-md shadow-lg">
                    <p className="font-bold text-[var(--text-primary)] tracking-wide uppercase text-xs mb-4">In the next 3 mins, we will:</p>
                    <div className="flex items-center gap-3 font-medium">
                        <span className="bg-green-500/20 text-green-400 p-1 rounded-full"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg></span>
                        <span>Learn your constraints</span>
                    </div>
                    <div className="flex items-center gap-3 font-medium">
                        <span className="bg-green-500/20 text-green-400 p-1 rounded-full"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg></span>
                        <span>Understand your goals</span>
                    </div>
                    <div className="flex items-center gap-3 font-medium">
                        <span className="bg-green-500/20 text-green-400 p-1 rounded-full"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg></span>
                        <span>Generate your first real week</span>
                    </div>
                </div>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
                className="w-full space-y-6 max-w-md bg-[var(--glass-bg)] border border-[var(--glass-border)] p-8 rounded-3xl backdrop-blur-lg shadow-xl"
            >
                <div className="space-y-3 text-left">
                    <label className="text-[10px] font-bold text-[var(--text-primary)]/50 uppercase tracking-widest pl-1">
                        What should we call you?
                    </label>
                    <Input
                        type="text"
                        placeholder="Full Name"
                        value={data.full_name}
                        onChange={(e) => updateData({ full_name: e.target.value })}
                        className="bg-[var(--glass-bg-active)] border-[var(--glass-border)] text-[var(--text-primary)] text-lg py-7 rounded-2xl hover:border-[var(--glass-border)] focus:border-white focus:ring-1 focus:ring-white placeholder:text-[var(--text-primary)]/20 transition-all font-bold tracking-wide shadow-inner"
                        autoFocus
                    />
                </div>
                
                <div className="space-y-3 text-left">
                    <label className="text-[10px] font-bold text-[var(--text-primary)]/50 uppercase tracking-widest pl-1 flex items-center justify-between">
                        <span>Timezone</span>
                        <span className="text-[var(--text-primary)]/30 text-[9px] bg-[var(--glass-bg)] px-2 py-0.5 rounded-full border border-[var(--glass-border)]">Auto-detected</span>
                    </label>
                    <Input
                        type="text"
                        value={data.timezone}
                        onChange={(e) => updateData({ timezone: e.target.value })}
                        className="bg-[var(--glass-bg-active)] border-[var(--glass-border)] text-[var(--text-primary)]/50 text-lg py-7 rounded-2xl focus:border-[var(--glass-border)] font-mono tracking-wider shadow-inner"
                    />
                </div>
            </motion.div>
        </div>
    );
}
