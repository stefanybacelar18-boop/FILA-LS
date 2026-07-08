"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { QueueEntry } from "@/lib/types";
import type { PublicQueueStats } from "@/lib/public-queue-stats";
import { PUBLIC_QUEUE_POLL_MS } from "@/lib/queue-refresh";

const EMPTY_STATS: PublicQueueStats = {
  aguardando: 0,
  ausentes: 0,
  finalizados: 0,
};

/** Fila operacional pública — polling (anon não recebe Realtime por RLS). */
export function usePublicQueueData() {
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [stats, setStats] = useState<PublicQueueStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (bypassCache = false) => {
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 25_000);
      const url = bypassCache
        ? `/api/queue/operational?_=${Date.now()}`
        : "/api/queue/operational";
      const res = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
      });
      window.clearTimeout(timer);

      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        data?: QueueEntry[];
        meta?: { stats?: PublicQueueStats };
      };

      if (!res.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }

      setEntries(json.data ?? []);
      setStats(json.meta?.stats ?? EMPTY_STATS);
      setError(null);
    } catch {
      setError("Não foi possível carregar a fila.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRef = useRef(fetchData);
  fetchRef.current = fetchData;

  useEffect(() => {
    void fetchRef.current();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void fetchRef.current();
      }
    }, PUBLIC_QUEUE_POLL_MS);

    function onVisible() {
      if (document.visibilityState === "visible") {
        void fetchRef.current();
      }
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const refresh = useCallback(() => fetchData(true), [fetchData]);

  return { entries, stats, loading, error, refresh };
}
