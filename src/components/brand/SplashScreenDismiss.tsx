"use client";

import { useEffect } from "react";

const MIN_VISIBLE_MS = 750;
const FADE_MS = 450;

/** Oculta a splash após carregar — transição suave */
export function SplashScreenDismiss() {
  useEffect(() => {
    const splash = document.getElementById("app-splash");
    if (!splash) return;

    const started = performance.now();

    function hide() {
      const el = document.getElementById("app-splash");
      if (!el) return;

      const elapsed = performance.now() - started;
      const delay = Math.max(0, MIN_VISIBLE_MS - elapsed);

      window.setTimeout(() => {
        el.classList.add("app-splash--exit");
        el.setAttribute("aria-busy", "false");
        window.setTimeout(() => el.remove(), FADE_MS);
      }, delay);
    }

    if (document.readyState === "complete") {
      hide();
      return;
    }

    window.addEventListener("load", hide, { once: true });
    return () => window.removeEventListener("load", hide);
  }, []);

  return null;
}
