'use client';

import { useEffect } from 'react';

/**
 * Registers /sw.js for every visitor, not just the ones who open Settings or
 * enable notifications. register() is idempotent — it returns the existing
 * registration if the worker is already installed.
 */
export function ServiceWorkerRegister() {
    useEffect(() => {
        if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

        navigator.serviceWorker.register('/sw.js').catch((error) => {
            console.warn('[PWA] Service worker registration failed:', error);
        });
    }, []);

    return null;
}
