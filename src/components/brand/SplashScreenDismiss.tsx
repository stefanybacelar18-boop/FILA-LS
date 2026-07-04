"use client";

import { useEffect } from "react";

/** Mínimo para perceber a marca — curto para não atrasar */
const MIN_VISIBLE_MS = 320;
const FADE_MS = 280;
const MAX_WAIT_MS = 1800;

/** Oculta a splash cedo (DOM pronto), sem esperar todos os assets */
export function SplashScreenDismiss() {
  useEffect(() => {
    const started = performance.now();
    let done = false;

    function hide() {
      if (done) return;
      const el = document.getElementById("app-splash");
      if (!el) return;

      const elapsed = performance.now() - started;
      const delay = Math.max(0, MIN_VISIBLE_MS - elapsed);

      window.setTimeout(() => {
        if (done) return;
        done = true;
        el.classList.add("app-splash--exit");
        el.setAttribute("aria-busy", "false");
        window.setTimeout(() => el.remove(), FADE_MS);
      }, delay);
    }

    function onReady() {
      if (document.readyState === "loading") return;
      hide();
    }

    if (document.readyState !== "loading") {
      onReady();
    } else {
      document.addEventListener("DOMContentLoaded", onReady, { once: true });
    }

    const safety = window.setTimeout(hide, MAX_WAIT_MS);

    return () => {
      document.removeEventListener("DOMContentLoaded", onReady);
      window.clearTimeout(safety);
    };
  }, []);

  return null;
}
