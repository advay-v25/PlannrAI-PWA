
'use client';

import { motion } from 'framer-motion';
import { CheckCircle2, Rocket } from 'lucide-react';

export function Step6Complete() {
    return (
        <div className="h-full flex flex-col items-center justify-center text-center space-y-8">

            <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 20 }}
                className="relative"
            >
                <div className="w-32 h-32 rounded-full bg-[var(--color-primary)]/20 flex items-center justify-center animate-pulse">
                    <Rocket className="w-16 h-16 text-[var(--color-primary)]" />
                </div>
                {/* Orbiting particles */}
                <div className="absolute inset-0 animate-[spin_4s_linear_infinite]">
                    <div className="absolute top-0 left-1/2 w-2 h-2 rounded-full bg-white shadow-[0_0_10px_white]" />
                </div>
            </motion.div>

            <div className="space-y-4 max-w-sm">
                <motion.h2
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="text-4xl font-display font-bold"
                >
                    System Online
                </motion.h2>
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="text-lg text-[var(--color-text-secondary)]"
                >
                    All protocols have been successfully initialized. Your Neural Operating System is ready.
                </motion.p>
            </div>

            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-2"
            >
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-sm font-mono uppercase tracking-wider">Ready for Deployment</span>
            </motion.div>
        </div>
    );
}
