importScripts('https://www.gstatic.com/firebasejs/12.6.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.6.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDmFsPIBhXg-YceYhKnygwBYdfMQEzHNm8',
  authDomain: 'csi-tenis-98255.firebaseapp.com',
  projectId: 'csi-tenis-98255',
  storageBucket: 'csi-tenis-98255.firebasestorage.app',
  messagingSenderId: '61905597245',
  appId: '1:61905597245:web:e9fa2b4597d3f0327c4b54',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notification = payload.notification || {};
  const data = payload.data || {};
  const title = notification.title || data.title || 'Nueva reserva';
  const options = {
    body: notification.body || data.body || 'Hay una novedad en el panel de administracion.',
    icon: '/icons/csi-tenis-icon.svg',
    badge: '/icons/csi-tenis-icon.svg',
    data,
  };

  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/admin/dashboard';

  event.waitUntil(
    self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((clients) => {
      const existingClient = clients.find((client) => 'focus' in client);

      if (existingClient) {
        existingClient.focus();
        return;
      }

      return self.clients.openWindow(targetUrl);
    }),
  );
});
