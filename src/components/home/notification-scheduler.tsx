'use client';

import { useEffect, useRef } from 'react';
import { useNotifications } from '@/hooks/use-notifications';

interface ScheduleBlock {
    id: string;
    title?: string;
    block_type?: string;
    start_time: string;
    end_time: string;
    date: string;
    status?: string;
}

interface NotificationSchedulerProps {
    blocks: ScheduleBlock[];
    date: string;
}

/**
 * Invisible component that monitors schedule blocks
 * and fires browser notifications when blocks are about to start.
 */
export function NotificationScheduler({ blocks, date }: NotificationSchedulerProps) {
    const { permission, sendLocal } = useNotifications();
    const notifiedRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (permission !== 'granted') return;

        const todayStr = new Date().toISOString().split('T')[0];
        if (date !== todayStr) return;

        const interval = setInterval(() => {
            const now = new Date();
            const currentH = now.getHours();
            const currentM = now.getMinutes();
            const currentMinutes = currentH * 60 + currentM;

            blocks.forEach(block => {
                if (block.status === 'done' || block.status === 'missed') return;
                if (notifiedRef.current.has(block.id)) return;

                const [bh, bm] = block.start_time.split(':').map(Number);
                const blockMinutes = bh * 60 + bm;

                // Notify 2 minutes before or at block start
                const diff = blockMinutes - currentMinutes;
                if (diff >= 0 && diff <= 2) {
                    const title = block.title || block.block_type || 'Block';
                    sendLocal(
                        `⏰ ${title}`,
                        `Starting now: ${block.start_time} - ${block.end_time}`,
                        '/app'
                    );
                    notifiedRef.current.add(block.id);
                }
            });
        }, 30000); // Check every 30 seconds

        return () => clearInterval(interval);
    }, [blocks, date, permission, sendLocal]);

    return null; // Invisible scheduler
}
