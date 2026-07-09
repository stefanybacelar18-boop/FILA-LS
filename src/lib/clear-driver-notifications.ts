/** Remove notificacoes de chamada do FilaDock ao abrir o app (nao afeta a do Chrome). */
export async function clearDriverCallNotifications() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const notifications = await registration.getNotifications();
    for (const notification of notifications) {
      const tag = notification.tag ?? "";
      if (tag === "filadock-driver-call" || tag.startsWith("driver-call-")) {
        notification.close();
      }
    }
  } catch {
    // noop
  }
}
