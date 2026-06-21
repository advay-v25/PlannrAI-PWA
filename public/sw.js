// PlannrAI Consolidated Service Worker
// Handles caching for offline PWA support AND Web Push notifications

const CACHE_NAME = 'plannrai-offline-cache-v1';

// Assets to precache on install
const PRECACHE_ASSETS = [
    '/',
    '/app',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(PRECACHE_ASSETS);
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Intercept fetch requests for caching
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Bypass caching for API endpoints and WebSockets
    if (
        url.pathname.startsWith('/api/') || 
        url.pathname.startsWith('/_next/webpack-hmr') ||
        event.request.method !== 'GET'
    ) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }

            return fetch(event.request).then((networkResponse) => {
                // Cache dynamic assets (like Next.js chunks) on the fly
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            }).catch(() => {
                // If offline and request fails, try to return the offline fallback
                if (event.request.mode === 'navigate') {
                    return caches.match('/app');
                }
            });
        })
    );
});

// ── Web Push Event Listeners ──────────────────────────────────────────────────

self.addEventListener('push', (event) => {
    let data = { title: 'PlannrAI', body: 'Time for your next block.' };

    if (event.data) {
        try {
            data = event.data.json();
        } catch {
            data.body = event.data.text();
        }
    }

    const options = {
        body: data.body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-512.png',
        vibrate: [100, 50, 100],
        data: {
            url: data.url || '/app',
        },
        actions: [
            { action: 'open', title: 'Open' },
            { action: 'dismiss', title: 'Dismiss' },
        ],
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const url = event.notification.data?.url || '/app';

    if (event.action === 'dismiss') return;

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
            // If already open, focus
            const existing = clients.find(c => c.url.includes('/app'));
            if (existing) {
                return existing.focus();
            }
            // Open new window
            return self.clients.openWindow(url);
        })
    );
});
