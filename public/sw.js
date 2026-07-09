const CACHE = "filadock-v24";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(["/", "/login/motorista", "/fila-descarga", "/manifest.json"])
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/** Rede primeiro — app sempre usa dados ao vivo da Vercel/Supabase */
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request).then((r) => r ?? caches.match("/")))
  );
});

self.addEventListener("push", (event) => {
  let payload = {
    title: "FilaDock",
    body: "Voce recebeu uma atualizacao da fila.",
    url: "/motorista",
    tag: "filadock-notification",
  };

  try {
    const parsed = event.data?.json();
    if (parsed && typeof parsed === "object") {
      payload = {
        ...payload,
        ...parsed,
      };
    }
  } catch {
    // keep fallback payload
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      vibrate: [250, 120, 250],
      data: { url: payload.url },
      tag: payload.tag,
      renotify: true,
      requireInteraction: true,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || "/motorista";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
