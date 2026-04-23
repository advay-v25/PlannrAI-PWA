// PlannrAI Service Worker for Push Notifications

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// Handle push events
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

// Handle notification click
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
