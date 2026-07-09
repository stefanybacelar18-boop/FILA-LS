"use client";

import { useEffect } from "react";

/** Registra service worker para instalação como app (Android / Chrome). */
export function PwaRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    async function register() {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        await registration.update();
      } catch {
        /* silencioso — PWA ainda funciona via manifest no iOS */
      }
    }

    void register();
  }, []);

  return null;
}
