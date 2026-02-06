'use client';

import { motion } from 'framer-motion';
import { Info, AlertTriangle } from 'lucide-react';
import { AnticipationSignal } from '@/lib/intelligence/anticipation-service';

export function AnticipationBanner({ signal }: { signal: AnticipationSignal }) {
    if (!signal.message) return null;

    const isWarn = signal.severity === 'warn';

    return (
        <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${isWarn
                    ? 'bg-[var(--color-warning)]/10 border-[var(--color-warning)]/20 text-[var(--color-warning)]'
                    : 'bg-[var(--color-primary)]/10 border-[var(--color-primary)]/20 text-[var(--color-primary)]'
                }`}
        >
            {isWarn ? <AlertTriangle className="w-4 h-4" /> : <Info className="w-4 h-4" />}
            <p className="text-sm font-medium">{signal.message}</p>
        </motion.div>
    );
}
