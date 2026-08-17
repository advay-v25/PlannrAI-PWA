'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';

type NotifPermission = 'default' | 'granted' | 'denied';

/**
 * `checking` is deliberately distinct from `inactive`: the in-app scheduler uses
 * this to decide whether it is allowed to fire, and firing during the async
 * lookup would double-notify on devices that do have push.
 */
export type PushStatus = 'checking' | 'active' | 'inactive';

/** Endpoint we last POSTed, so a relaunch doesn't re-POST an unchanged one. */
const SYNCED_ENDPOINT_KEY = 'plannrai_push_endpoint';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = window.atob(base64);
    const output = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
    return output;
}

function readSyncedEndpoint(): string | null {
    try {
        return window.localStorage.getItem(SYNCED_ENDPOINT_KEY);
    } catch {
        return null;
    }
}

function writeSyncedEndpoint(endpoint: string | null) {
    try {
        if (endpoint === null) window.localStorage.removeItem(SYNCED_ENDPOINT_KEY);
        else window.localStorage.setItem(SYNCED_ENDPOINT_KEY, endpoint);
    } catch {
        /* private mode — we just re-POST next launch, which upserts harmlessly */
    }
}

function serializeSubscription(sub: PushSubscription) {
    const json = sub.toJSON() as { keys?: { p256dh?: string; auth?: string } };
    return {
        endpoint: sub.endpoint,
        keys: {
            p256dh: json.keys?.p256dh ?? '',
            auth: json.keys?.auth ?? '',
        },
    };
}

export function isPushSupported(): boolean {
    return (
        typeof window !== 'undefined' &&
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        'Notification' in window
    );
}

/**
 * `navigator.serviceWorker.ready` never rejects — it simply never settles if the
 * worker fails to activate. Left unbounded that would pin pushStatus on
 * 'checking' forever, which silently disables the in-app fallback scheduler, so
 * we give up after a few seconds and treat the device as push-less.
 */
async function serviceWorkerReady(timeoutMs = 5000): Promise<ServiceWorkerRegistration | null> {
    return await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>(resolve => setTimeout(() => resolve(null), timeoutMs)),
    ]);
}

/**
 * Make sure this device has a push subscription registered server-side.
 *
 * Safe to call on every app launch: iOS throws the subscription away when a PWA
 * is deleted and re-added, so we re-subscribe when it is gone and only hit the
 * network when the endpoint actually changed.
 *
 * No-ops (returns false) when push is unsupported, permission is not granted, or
 * the VAPID key is not configured — never throws into a render path.
 */
export async function ensurePushSubscription(): Promise<boolean> {
    if (!isPushSupported() || !VAPID_PUBLIC_KEY) return false;
    if (Notification.permission !== 'granted') return false;

    try {
        const registration = await serviceWorkerReady();
        if (!registration) return false;

        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
            });
        }

        if (subscription.endpoint !== readSyncedEndpoint()) {
            await apiClient.post('/api/notifications/subscribe', serializeSubscription(subscription));
            writeSyncedEndpoint(subscription.endpoint);
        }
        return true;
    } catch (err) {
        console.warn('[Push] subscription failed:', err);
        return false;
    }
}

/**
 * Tear down this device's subscription — called when the user turns
 * notifications off, so the sender stops targeting an endpoint they muted.
 */
export async function removePushSubscription(): Promise<void> {
    if (!isPushSupported()) return;

    try {
        const registration = await serviceWorkerReady();
        if (!registration) return;

        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            writeSyncedEndpoint(null);
            return;
        }

        // Drop the server row first: if unsubscribe() succeeded but the DELETE
        // did not, the sender would keep pushing to a live-but-muted endpoint.
        try {
            await apiClient.delete('/api/notifications/subscribe', { endpoint: subscription.endpoint });
        } catch (err) {
            console.warn('[Push] failed to delete subscription server-side:', err);
        }

        await subscription.unsubscribe();
        writeSyncedEndpoint(null);
    } catch (err) {
        console.warn('[Push] unsubscribe failed:', err);
    }
}

export function useNotifications() {
    const [permission, setPermission] = useState<NotifPermission>('default');
    const [supported, setSupported] = useState(false);
    const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);
    const [pushStatus, setPushStatus] = useState<PushStatus>('checking');

    useEffect(() => {
        if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
            setPushStatus('inactive');
            return;
        }

        setSupported(true);
        setPermission(Notification.permission as NotifPermission);

        let cancelled = false;

        navigator.serviceWorker.register('/sw.js').then(reg => {
            if (!cancelled) setSwRegistration(reg);
            // Launch-time re-subscribe check (iOS invalidates on PWA reinstall).
            return ensurePushSubscription();
        }).then(active => {
            if (!cancelled) setPushStatus(active ? 'active' : 'inactive');
        }).catch(err => {
            console.warn('[Notifications] SW registration failed:', err);
            if (!cancelled) setPushStatus('inactive');
        });

        return () => { cancelled = true; };
    }, []);

    const requestPermission = useCallback(async () => {
        if (!supported) return false;
        try {
            const result = await Notification.requestPermission();
            setPermission(result as NotifPermission);
            if (result !== 'granted') return false;

            setPushStatus((await ensurePushSubscription()) ? 'active' : 'inactive');
            return true;
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
        pushStatus,
        requestPermission,
        sendLocal,
    };
}
