'use client';

import { useEffect, useState } from 'react';
import { CoachChat } from './CoachChat';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

interface CoachDashboardProps {
    onCalendarUpdate?: () => void;
    initialQuickAction?: 'reduce_today_load' | 'fix_today_schedule' | 'do_more_today';
}

export function CoachDashboard({ onCalendarUpdate, initialQuickAction }: CoachDashboardProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    if (!mounted) return (
        <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 text-[var(--text-muted)] animate-spin" />
        </div>
    );

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            className="flex flex-col h-full w-full"
        >
            <div className="flex-1 min-h-0">
                <CoachChat onCalendarUpdate={onCalendarUpdate} initialQuickAction={initialQuickAction} />
            </div>
        </motion.div>
    );
}
