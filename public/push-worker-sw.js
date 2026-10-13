self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("push", (event) => {
  let update;
  try {
    update = event.data.json();
  } catch {
    return;
  }
  event.waitUntil(
    self.registration.showNotification("Shiftline · " + update.title, {
      body: "Open Shiftline to view the update.",
      tag: update.id,
      icon: "/app-icon-192.png",
      data: { url: "/?notification=" + encodeURIComponent(update.id) },
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const url = new URL(event.notification.data.url, self.location.origin);
      if (url.origin !== self.location.origin) return;
      // Do not navigate an open form or attendance draft; open a separate view.
      await self.clients.openWindow(url.href);
    })(),
  );
});
