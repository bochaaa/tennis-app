self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};

  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = {
        title: 'Nueva notificacion',
        body: event.data.text(),
      };
    }
  }

  const title = payload.title || payload.notification?.title || 'Nueva reserva';
  const options = {
    body: payload.body || payload.notification?.body || 'Hay una novedad en el panel de administracion.',
    icon: payload.icon || '/icons/csi-tenis-icon.svg',
    badge: payload.badge || '/icons/csi-tenis-icon.svg',
    data: payload.data || payload,
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: 'PUSH_NOTIFICATION',
            title,
            body: options.body,
            data: options.data,
            receivedAt: new Date().toISOString(),
          });
        });
      }),
    ]),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || event.notification.data?.path || '/admin/dashboard';

  event.waitUntil(
    self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((clients) => {
      const existingClient = clients.find((client) => 'focus' in client);

      if (existingClient) {
        existingClient.focus();
        existingClient.postMessage({
          type: 'OPEN_NOTIFICATION_TARGET',
          url: targetUrl,
        });
        return;
      }

      return self.clients.openWindow(targetUrl);
    }),
  );
});
