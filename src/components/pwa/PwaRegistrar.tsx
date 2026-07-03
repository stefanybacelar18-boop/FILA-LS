"use client";

import { useEffect } from "react";

/** Registra service worker para instalação como app (Android / Chrome). */
export function PwaRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* silencioso — PWA ainda funciona via manifest no iOS */
    });
  }, []);

  return null;
}
