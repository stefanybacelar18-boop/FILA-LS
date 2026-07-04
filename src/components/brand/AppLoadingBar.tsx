"use client";

import { useEffect, useState } from "react";

const MIN_VISIBLE_MS = 180;
const FADE_MS = 200;
const MAX_WAIT_MS = 1200;

type Phase = "loading" | "done" | "hidden";

/** Barra fina no topo — carregamento inicial leve, sem tela cheia. */
export function AppLoadingBar() {
  const [phase, setPhase] = useState<Phase>("loading");

  useEffect(() => {
    const started = performance.now();
    let doneTimer: number | undefined;
    let hideTimer: number | undefined;

    function finish() {
      setPhase("done");
      hideTimer = window.setTimeout(() => setPhase("hidden"), FADE_MS);
    }

    function scheduleFinish() {
      const elapsed = performance.now() - started;
      const delay = Math.max(0, MIN_VISIBLE_MS - elapsed);
      doneTimer = window.setTimeout(finish, delay);
    }

    if (document.readyState !== "loading") {
      scheduleFinish();
    } else {
      document.addEventListener("DOMContentLoaded", scheduleFinish, { once: true });
    }

    const safety = window.setTimeout(finish, MAX_WAIT_MS);

    return () => {
      if (doneTimer) window.clearTimeout(doneTimer);
      if (hideTimer) window.clearTimeout(hideTimer);
      window.clearTimeout(safety);
    };
  }, []);

  if (phase === "hidden") return null;

  return (
    <div
      className={phase === "done" ? "app-loading-bar app-loading-bar--done" : "app-loading-bar"}
      role="progressbar"
      aria-label="Carregando"
      aria-busy={phase === "loading"}
    >
      <div className="app-loading-bar__track">
        <div className="app-loading-bar__fill" />
      </div>
    </div>
  );
}
