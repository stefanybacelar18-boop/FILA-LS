"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { QueueEntry } from "@/lib/types";
import type { PublicQueueStats } from "@/lib/public-queue-stats";

const POLL_MS = 15_000;

const EMPTY_STATS: PublicQueueStats = {
  aguardando: 0,
  ausentes: 0,
  finalizados: 0,
};

/** Fila operacional pública — sem autenticação */
export function usePublicQueueData() {
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [stats, setStats] = useState<PublicQueueStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 25_000);
      const res = await fetch("/api/queue/operational", {
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
    const timer = window.setInterval(() => void fetchRef.current(), POLL_MS);
    return () => window.clearInterval(timer);
  }, []);

  return { entries, stats, loading, error, refresh: fetchData };
}
