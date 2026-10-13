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
      data: { url: "/manager?tab=Notifications" },
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.openWindow(new URL("/manager?tab=Notifications", self.location.origin).href),
  );
});
