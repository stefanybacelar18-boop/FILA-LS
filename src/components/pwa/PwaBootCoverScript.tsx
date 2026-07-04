"use client";

import { useEffect } from "react";

/** Cobre a transição pós-splash nativa no PWA — fundo azul, sem logo. */
export function PwaBootCoverScript() {
  useEffect(() => {
    const root = document.documentElement;
    if (!root.classList.contains("pwa-standalone")) return;

    function dismiss() {
      root.classList.add("pwa-boot-done");
      window.setTimeout(() => root.classList.add("pwa-boot-removed"), 240);
    }

    if (document.readyState === "complete") {
      window.requestAnimationFrame(dismiss);
    } else {
      window.addEventListener("load", () => window.requestAnimationFrame(dismiss), { once: true });
    }
  }, []);

  return null;
}
