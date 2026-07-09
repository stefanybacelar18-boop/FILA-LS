const CACHE = "filadock-v25";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(["/", "/login/motorista", "/motorista", "/fila-descarga", "/manifest.json"])
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

function parsePushPayload(event) {
  const fallback = {
    title: "FilaDock — Voce foi chamado",
    body: "Apresente-se no ponto de operacao.",
    url: "/motorista",
    tag: "filadock-driver-call",
  };

  if (!event.data) return fallback;

  try {
    const parsed = event.data.json();
    if (parsed && typeof parsed === "object") {
      return { ...fallback, ...parsed };
    }
  } catch {
    try {
      const text = event.data.text();
      if (text) return { ...fallback, body: text };
    } catch {
      // keep fallback
    }
  }

  return fallback;
}

self.addEventListener("push", (event) => {
  const payload = parsePushPayload(event);

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      image: "/icons/icon-512-plain.png",
      vibrate: [400, 150, 400, 150, 600],
      silent: false,
      data: { url: payload.url },
      tag: payload.tag,
      renotify: true,
      requireInteraction: true,
      actions: [{ action: "open", title: "Abrir fila" }],
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
          if ("navigate" in client) {
            return client.navigate(targetUrl).then(() => client.focus());
          }
          client.focus();
          return undefined;
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    fetch("/api/notifications/subscribe", { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => {
        if (!json?.publicKey) return;
        const padded = `${json.publicKey}${"=".repeat((4 - (json.publicKey.length % 4)) % 4)}`
          .replace(/-/g, "+")
          .replace(/_/g, "/");
        const raw = atob(padded);
        const key = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i += 1) key[i] = raw.charCodeAt(i);

        return self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        });
      })
      .then((subscription) => {
        if (!subscription) return;
        return fetch("/api/notifications/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(subscription.toJSON()),
        });
      })
      .catch(() => undefined)
  );
});
