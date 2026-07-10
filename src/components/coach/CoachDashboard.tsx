'use client';

import { useEffect, useState } from 'react';
import { CoachChat } from './CoachChat';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

export function CoachDashboard({ onCalendarUpdate }: { onCalendarUpdate?: () => void }) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    if (!mounted) return (
        <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 text-[var(--text-muted)] dark:text-white/20 animate-spin" />
        </div>
    );

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col h-full w-full"
        >
            <div className="flex-1 min-h-0">
                <CoachChat onCalendarUpdate={onCalendarUpdate} />
            </div>
        </motion.div>
    );
}
