"use client";

import { useCallback, useEffect, useState } from "react";
import { ensureDriverPushSubscription, isDriverPushSupported } from "@/lib/driver-push-client";

export function useDriverPushSubscription(active = true) {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const refreshPermission = useCallback(() => {
    if (!isDriverPushSupported()) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
  }, []);

  const enablePush = useCallback(async (requestPermission = true) => {
    setSyncing(true);
    setSyncError(null);
    try {
      const result = await ensureDriverPushSubscription({ requestPermission });
      setPermission(result);
      if (result === "denied") {
        setSyncError("Notificacoes bloqueadas no celular. Ative nas configuracoes do app.");
      }
      return result;
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Erro ao ativar notificacoes");
      return Notification.permission;
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    refreshPermission();
  }, [refreshPermission]);

  useEffect(() => {
    if (!active || !isDriverPushSupported()) return;

    if (Notification.permission === "granted") {
      void enablePush(false);
      return;
    }

    const timer = window.setTimeout(() => {
      if (Notification.permission === "default") {
        void enablePush(true);
      }
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [active, enablePush]);

  return {
    permission,
    syncing,
    syncError,
    enablePush,
    refreshPermission,
    supported: permission !== "unsupported",
  };
}
