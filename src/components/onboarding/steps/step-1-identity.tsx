'use client';

import { motion } from 'framer-motion';
import { useOnboardingStore } from '@/stores';
import { Input } from '@/components/ui/input';

export function Step1Identity() {
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
                    INITIALIZE <span className="text-[var(--color-primary)]">PERSONALOS</span>
                </h1>
                <p className="text-[var(--color-text-secondary)] text-lg">
                    Your life deserves an operating system.
                </p>
                <div className="bg-[var(--glass-surface)] border border-[var(--glass-border)] rounded-lg p-4 mt-6 text-sm text-left text-[var(--color-text-tertiary)] mx-auto max-w-xs space-y-2">
                    <p className="font-semibold text-white">In the next 3 minutes, we'll:</p>
                    <p>✓ Learn your constraints</p>
                    <p>✓ Understand your goals</p>
                    <p>✓ Generate your first real week</p>
                </div>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
                className="w-full space-y-6 pt-4"
            >
                <div className="space-y-2 text-left">
                    <label className="text-sm font-mono text-[var(--color-text-tertiary)] uppercase tracking-wider pl-1">
                        What should we call you?
                    </label>
                    <Input
                        type="text"
                        placeholder="Full Name"
                        value={data.full_name}
                        onChange={(e) => updateData({ full_name: e.target.value })}
                        className="bg-[var(--glass-surface)] border-[var(--glass-border)] text-white text-lg py-6 focus:ring-[var(--color-primary)] placeholder:text-gray-600 font-mono"
                        autoFocus
                    />
                </div>
                
                <div className="space-y-2 text-left">
                    <label className="text-sm font-mono text-[var(--color-text-tertiary)] uppercase tracking-wider pl-1">
                        Timezone
                    </label>
                    <Input
                        type="text"
                        value={data.timezone}
                        onChange={(e) => updateData({ timezone: e.target.value })}
                        className="bg-[var(--glass-surface)] border-[var(--glass-border)] text-white text-lg py-6 focus:ring-[var(--color-primary)] font-mono opacity-80"
                    />
                    <p className="text-[10px] text-[var(--color-text-tertiary)] pl-1">Auto-detected</p>
                </div>
            </motion.div>
        </div>
    );
}
