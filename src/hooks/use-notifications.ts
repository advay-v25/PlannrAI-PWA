'use client';

import { useState, useEffect, useCallback } from 'react';

type NotifPermission = 'default' | 'granted' | 'denied';

export function useNotifications() {
    const [permission, setPermission] = useState<NotifPermission>('default');
    const [supported, setSupported] = useState(false);
    const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);

    useEffect(() => {
        if (typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator) {
            setSupported(true);
            setPermission(Notification.permission as NotifPermission);

            // Register service worker
            navigator.serviceWorker.register('/sw.js').then(reg => {
                setSwRegistration(reg);
            }).catch(err => {
                console.warn('[Notifications] SW registration failed:', err);
            });
        }
    }, []);

    const requestPermission = useCallback(async () => {
        if (!supported) return false;
        try {
            const result = await Notification.requestPermission();
            setPermission(result as NotifPermission);
            return result === 'granted';
        } catch {
            return false;
        }
    }, [supported]);

    const sendLocal = useCallback((title: string, body: string, url?: string) => {
        if (permission !== 'granted' || !swRegistration) return;

        swRegistration.showNotification(title, {
            body,
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-512.png',
            vibrate: [100, 50, 100],
            data: { url: url || '/app' },
        } as any);
    }, [permission, swRegistration]);

    return {
        supported,
        permission,
        requestPermission,
        sendLocal,
    };
}
