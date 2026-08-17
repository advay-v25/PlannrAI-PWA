'use client';

import { useEffect, useRef, useState } from 'react';
import { useNotifications } from '@/hooks/use-notifications';

/**
 * Local mirror of `profile_preferences.notifications_enabled`.
 *
 * The scheduler only ever fires on the device that has the app open, so the flag
 * is read from localStorage instead of re-fetching preferences here. Settings
 * writes it on every toggle and re-seeds it from the server on each visit.
 */
export const NOTIFICATIONS_ENABLED_KEY = 'plannrai_notifications_enabled';
export const NOTIFICATIONS_ENABLED_EVENT = 'plannrai:notifications-enabled-changed';

export function readNotificationsEnabled(): boolean {
    if (typeof window === 'undefined') return true;
    try {
        const stored = window.localStorage.getItem(NOTIFICATIONS_ENABLED_KEY);
        // Nothing stored yet → browser permission stays the only gate, as before.
        return stored === null ? true : stored === 'true';
    } catch {
        return true;
    }
}

export function writeNotificationsEnabled(enabled: boolean) {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, String(enabled));
        window.dispatchEvent(new Event(NOTIFICATIONS_ENABLED_EVENT));
    } catch {
        /* private mode / storage disabled — permission remains the gate */
    }
}

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
    const { permission, pushStatus, sendLocal } = useNotifications();
    const notifiedRef = useRef<Set<string>>(new Set());
    const [enabled, setEnabled] = useState(true);

    // Track the user's app-level preference (Settings → Data & Privacy → Notifications)
    useEffect(() => {
        const sync = () => setEnabled(readNotificationsEnabled());
        sync();
        window.addEventListener(NOTIFICATIONS_ENABLED_EVENT, sync);
        window.addEventListener('storage', sync);
        return () => {
            window.removeEventListener(NOTIFICATIONS_ENABLED_EVENT, sync);
            window.removeEventListener('storage', sync);
        };
    }, []);

    useEffect(() => {
        if (permission !== 'granted' || !enabled) return;

        // Web Push covers this device (and does it 5 min out, even when closed),
        // so the in-app ticker stands down to avoid a second notification. It
        // stays the fallback for browsers without push, and deliberately also
        // stands down while the subscription lookup is still in flight.
        if (pushStatus !== 'inactive') return;

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
    }, [blocks, date, permission, enabled, pushStatus, sendLocal]);

    return null; // Invisible scheduler
}
