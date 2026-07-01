self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function getReservationDateLabel(data) {
  const rawDate = data?.date || getReservationDateFromUrl(data?.url);

  if (!rawDate || !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    return '';
  }

  const parts = rawDate.split('-');
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function getReservationDateFromUrl(url) {
  if (!url) {
    return '';
  }

  try {
    return new URL(url, self.location.origin).searchParams.get('date') || '';
  } catch {
    return '';
  }
}

function getBodyWithReservationDate(body, data) {
  const dateLabel = getReservationDateLabel(data);

  if (!dateLabel || body.includes(dateLabel)) {
    return body;
  }

  return `${body} - ${dateLabel}`;
}

function getNotificationsTargetUrl(notification) {
  const targetUrl = new URL('/admin/notifications', self.location.origin);
  targetUrl.searchParams.set(
    'push',
    JSON.stringify({
      title: notification.title || 'Nueva reserva',
      body: getBodyWithReservationDate(
        notification.body || 'Hay una novedad en el panel de administracion.',
        notification.data || {},
      ),
      receivedAt: new Date().toISOString(),
      data: notification.data || {},
    }),
  );

  return targetUrl.href;
}

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
  const data = payload.data || payload;
  const body = getBodyWithReservationDate(
    payload.body || payload.notification?.body || 'Hay una novedad en el panel de administracion.',
    data,
  );
  const options = {
    body,
    icon: payload.icon || '/icons/csi-tenis-icon-192.png',
    badge: payload.badge || '/icons/csi-tenis-icon-192.png',
    data,
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

  const targetUrl = getNotificationsTargetUrl(event.notification);

  event.waitUntil(
    self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((clients) => {
      const existingClient = clients.find((client) => 'focus' in client);

      if (existingClient) {
        if ('navigate' in existingClient) {
          return existingClient.navigate(targetUrl).then((client) => {
            if (client) {
              return client.focus();
            }

            return existingClient.focus();
          });
        }

        return existingClient.focus();
      }

      return self.clients.openWindow(targetUrl);
    }),
  );
});
