"use client";

import { isPwaStandalone } from "@/lib/pwa-client";

function base64UrlToUint8Array(base64Url: string) {
  const padded = `${base64Url}${"=".repeat((4 - (base64Url.length % 4)) % 4)}`
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = window.atob(padded);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

export function isDriverPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function fetchPushPublicKey() {
  const res = await fetch("/api/notifications/subscribe", { cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as {
    publicKey?: string | null;
    enabled?: boolean;
  };
  if (!res.ok || !json.enabled || !json.publicKey) {
    return null;
  }
  return json.publicKey;
}

async function saveSubscriptionToServer(subscription: PushSubscription) {
  const res = await fetch("/api/notifications/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...subscription.toJSON(),
      clientMode: isPwaStandalone() ? "standalone" : "browser",
    }),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error ?? "Falha ao salvar notificacoes");
  }
}

export async function ensureDriverPushSubscription(options?: {
  requestPermission?: boolean;
}): Promise<NotificationPermission | "unsupported"> {
  if (!isDriverPushSupported()) return "unsupported";

  let permission = Notification.permission;
  if (permission === "default" && options?.requestPermission) {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") return permission;

  const publicKey = await fetchPushPublicKey();
  if (!publicKey) return permission;

  const registration = await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
    updateViaCache: "none",
  });
  await registration.update();
  const ready = await navigator.serviceWorker.ready;

  let subscription = await ready.pushManager.getSubscription();
  if (subscription) {
    try {
      await saveSubscriptionToServer(subscription);
      return permission;
    } catch {
      await subscription.unsubscribe().catch(() => undefined);
      subscription = null;
    }
  }

  subscription = await ready.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToUint8Array(publicKey),
  });

  await saveSubscriptionToServer(subscription);
  return permission;
}
