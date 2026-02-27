'use client';

import { motion } from 'framer-motion';
import { useOnboardingStore } from '@/stores';
import { Input } from '@/components/ui/input';

export function Step1Framing() {
    const { data, updateData } = useOnboardingStore();

    return (
        <div className="flex flex-col items-center justify-center space-y-8 text-center w-full max-w-md mx-auto">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="space-y-4"
            >
                <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-2 font-mono">
                    System <span className="text-[var(--color-primary)]">Calibration</span>
                </h1>
                <p className="text-[var(--color-text-secondary)] text-lg">
                    I am DONNA. I am not an organizational tool. I am an execution engine designed to protect your time and force momentum.
                </p>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
                className="w-full space-y-6 pt-8"
            >
                <div className="space-y-2 text-left">
                    <label className="text-sm font-mono text-[var(--color-text-tertiary)] uppercase tracking-wider pl-1">
                        Identify Operator
                    </label>
                    <Input
                        type="text"
                        placeholder="What do they call you?"
                        value={data.full_name}
                        onChange={(e) => updateData({ full_name: e.target.value })}
                        className="bg-[var(--glass-surface)] border-[var(--glass-border)] text-white text-lg py-6 focus:ring-[var(--color-primary)] placeholder:text-gray-600 font-mono"
                        autoFocus
                    />
                </div>
            </motion.div>

            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1, duration: 1 }}
                className="pt-12 flex items-center gap-2 text-[var(--color-text-tertiary)] font-mono text-xs"
            >
                <div className="w-2 h-2 rounded-full bg-[var(--color-green)] animate-pulse" />
                <span>Neural Audio Processing Offline. Manual Input Required.</span>
            </motion.div>
        </div>
    );
}
