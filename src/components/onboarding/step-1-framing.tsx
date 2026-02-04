import { motion } from 'framer-motion';
import { useOnboardingStore } from '@/stores';
import { GlassInput } from '@/components/ui/glass-input';
import { useState, useEffect } from 'react';

export function Step1Framing() {
    const { data, updateData } = useOnboardingStore();
    const [typedText, setTypedText] = useState('');
    const fullText = "Initialize Neural Link.";

    useEffect(() => {
        let i = 0;
        setTypedText(''); // Reset on mount
        const timer = setInterval(() => {
            i++;
            setTypedText(fullText.slice(0, i));
            if (i === fullText.length) {
                clearInterval(timer);
            }
        }, 50);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">

            {/* Holographic Icon */}
            <motion.div
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="mb-12 relative"
            >
                <div className="w-24 h-24 rounded-full border border-[var(--color-primary)]/30 flex items-center justify-center animate-[spin_10s_linear_infinite]">
                    <div className="w-16 h-16 rounded-full border border-[var(--color-primary)]/50 border-t-transparent animate-[spin_3s_linear_infinite_reverse]" />
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-[var(--color-primary)] shadow-[0_0_10px_var(--color-primary)]" />
                </div>
            </motion.div>

            <h2 className="text-3xl md:text-5xl font-display font-light mb-8 tracking-tight h-16">
                {typedText}
                <span className="animate-pulse">_</span>
            </h2>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.5, duration: 0.8 }}
                className="w-full max-w-sm space-y-6"
            >
                <div>
                    <label className="block text-xs font-mono text-[var(--color-text-tertiary)] uppercase tracking-widest mb-4">
                        Subject Identification
                    </label>
                    <div className="relative group">
                        <input
                            type="text"
                            value={data.full_name || ''}
                            onChange={(e) => updateData({ full_name: e.target.value })}
                            placeholder="Enter Designation"
                            className="w-full bg-transparent border-b-2 border-[var(--glass-border)] text-center text-2xl md:text-3xl py-4 focus:outline-none focus:border-[var(--color-primary)] transition-colors placeholder:text-[var(--glass-border)] font-light"
                            autoFocus
                        />
                        <div className="absolute bottom-0 left-0 w-full h-[2px] bg-[var(--color-primary)] scale-x-0 group-focus-within:scale-x-100 transition-transform duration-500" />
                    </div>
                </div>

                <p className="text-sm text-[var(--color-text-muted)] font-light">
                    Your personal neural operating system is ready to adapt.
                </p>
            </motion.div>
        </div>
    );
}
