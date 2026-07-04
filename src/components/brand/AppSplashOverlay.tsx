"use client";

import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";

/** Mínimo para perceber a marca — curto para não atrasar */
const MIN_VISIBLE_MS = 320;
const FADE_MS = 280;
const MAX_WAIT_MS = 1800;

type SplashPhase = "visible" | "exit" | "hidden";

/**
 * Splash inicial — descarte via React (nunca el.remove()).
 * Remover nós fora do React quebra a hidratação (DOMException insertBefore/removeChild).
 */
export function AppSplashOverlay() {
  const [phase, setPhase] = useState<SplashPhase>("visible");

  useEffect(() => {
    const started = performance.now();
    let exitTimer: number | undefined;
    let hideTimer: number | undefined;

    function startExit() {
      setPhase("exit");
      hideTimer = window.setTimeout(() => setPhase("hidden"), FADE_MS);
    }

    function scheduleExit() {
      const elapsed = performance.now() - started;
      const delay = Math.max(0, MIN_VISIBLE_MS - elapsed);
      exitTimer = window.setTimeout(startExit, delay);
    }

    if (document.readyState !== "loading") {
      scheduleExit();
    } else {
      document.addEventListener("DOMContentLoaded", scheduleExit, { once: true });
    }

    const safety = window.setTimeout(startExit, MAX_WAIT_MS);

    return () => {
      if (exitTimer) window.clearTimeout(exitTimer);
      if (hideTimer) window.clearTimeout(hideTimer);
      window.clearTimeout(safety);
    };
  }, []);

  if (phase === "hidden") return null;

  return (
    <div
      className={phase === "exit" ? "app-splash app-splash--exit" : "app-splash"}
      aria-live="polite"
      aria-busy={phase === "visible"}
    >
      <div className="app-splash__inner">
        <BrandLogo size="auth" markOnly className="app-splash__mark" />
        <div className="app-splash__loader" role="status" aria-label="Carregando" />
      </div>
    </div>
  );
}
