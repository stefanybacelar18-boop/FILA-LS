const CACHE = "filadock-v30";

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

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request).then((r) => r ?? caches.match("/")))
  );
});

function parsePushPayload(event) {
  const fallback = {
    title: "FilaDock — Chamada para descarga",
    body: "Dirija-se ao ponto de operação imediatamente. Sua presença foi solicitada pela equipe.",
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

function shouldSkipSystemNotification(clients) {
  return clients.some(
    (client) => client.visibilityState === "visible" && client.focused === true
  );
}

self.addEventListener("push", (event) => {
  const payload = parsePushPayload(event);

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const skipSystem = shouldSkipSystemNotification(clients);

      if (!skipSystem) {
        return self.registration.showNotification(payload.title, {
          body: payload.body,
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          vibrate: [500, 200, 500, 200, 700],
          silent: false,
          requireInteraction: true,
          data: { path: payload.url || "/motorista" },
          tag: payload.tag || "filadock-driver-call",
          renotify: true,
        });
      }

      clients.forEach((client) => {
        client.postMessage({ type: "DRIVER_CALLED", payload });
      });
      return undefined;
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetPath = event.notification?.data?.path || "/motorista";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          if ("navigate" in client) {
            return client.navigate(targetPath).then(() => client.focus());
          }
          client.focus();
          return undefined;
        }
      }
      return self.clients.openWindow(targetPath);
    })
  );
});

function detectClientMode() {
  return self.matchMedia("(display-mode: standalone)").matches ? "standalone" : "browser";
}

self.addEventListener("pushsubscriptionchange", (event) => {
  const clientMode = detectClientMode();

  event.waitUntil(
    fetch("/api/notifications/subscribe", { cache: "no-store", credentials: "include" })
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
          credentials: "include",
          body: JSON.stringify({
            ...subscription.toJSON(),
            clientMode,
          }),
        });
      })
      .catch(() => undefined)
  );
});
