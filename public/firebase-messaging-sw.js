importScripts('https://www.gstatic.com/firebasejs/12.6.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.6.0/firebase-messaging-compat.js');

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

firebase.initializeApp({
  apiKey: 'AIzaSyDmFsPIBhXg-YceYhKnygwBYdfMQEzHNm8',
  authDomain: 'csi-tenis-98255.firebaseapp.com',
  projectId: 'csi-tenis-98255',
  storageBucket: 'csi-tenis-98255.firebasestorage.app',
  messagingSenderId: '61905597245',
  appId: '1:61905597245:web:e9fa2b4597d3f0327c4b54',
});

const messaging = firebase.messaging();

const BACKEND_PATH_PREFIXES = ['/api/', '/django-admin/', '/static/', '/media/'];

function isBackendRequest(request) {
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return false;
  }

  return BACKEND_PATH_PREFIXES.some((prefix) => {
    const pathWithoutTrailingSlash = prefix.slice(0, -1);
    return url.pathname === pathWithoutTrailingSlash || url.pathname.startsWith(prefix);
  });
}

self.addEventListener('fetch', (event) => {
  if (isBackendRequest(event.request)) {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  event.respondWith(fetch(event.request));
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

messaging.onBackgroundMessage((payload) => {
  const notification = payload.notification || {};
  const data = payload.data || {};
  const title = notification.title || data.title || 'Nueva reserva';
  const body = getBodyWithReservationDate(
    notification.body || data.body || 'Hay una novedad en el panel de administracion.',
    data,
  );
  const options = {
    body,
    icon: '/icons/csi-tenis-icon-192.png',
    badge: '/icons/csi-tenis-icon-192.png',
    data,
  };

  self.registration.showNotification(title, options);
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
