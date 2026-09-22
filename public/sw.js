self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {
    title: 'SchoolRun',
    body: 'Ride update',
    tag: 'schoolrun',
    url: '/dashboard',
  };
  try {
    if (event.data) {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    }
  } catch {
    try {
      if (event.data) data.body = event.data.text();
    } catch {
      /* ignore */
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'SchoolRun', {
      body: data.body || '',
      tag: data.tag || 'schoolrun',
      icon: '/product-logo.png',
      badge: '/product-logo.png',
      vibrate: [200, 80, 200, 80, 400],
      renotify: true,
      requireInteraction: data.requireInteraction !== false,
      data: {
        url: data.url || '/dashboard',
        rideId: data.rideId || null,
      },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/dashboard';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.focus();
            if ('navigate' in client) return client.navigate(target);
            return undefined;
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(target);
        return undefined;
      }),
  );
});
