// Service Worker para notificações em segundo plano do MT 24 Horas Express Entregador
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let title = "Nova Corrida MT 24 Horas!";
  let body = "Toque para abrir e visualizar a entrega.";
  let data = {};

  if (event.data) {
    try {
      const json = event.data.json();
      title = json.notification?.title || json.title || json.data?.title || title;
      body = json.notification?.body || json.body || json.data?.body || json.details || body;
      data = json.data || json;
    } catch (e) {
      body = event.data.text() || body;
    }
  }

  const options = {
    body: body,
    icon: "/favicon-v3.png",
    badge: "/favicon-v3.png",
    vibrate: [500, 200, 500, 200, 500],
    data: data,
    requireInteraction: true,
    tag: data.deliveryId || data.id || "delivery-incoming",
    renotify: true,
    actions: [
      { action: "open", title: "Abrir App" }
    ]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const deliveryId = event.notification.data?.deliveryId || event.notification.data?.id;
  const targetUrl = deliveryId ? `/driver?deliveryId=${deliveryId}` : "/driver";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes("/driver") && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
