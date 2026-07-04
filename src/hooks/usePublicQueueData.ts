"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { QueueEntry } from "@/lib/types";
import { fetchEnrichedOperationalQueue } from "@/lib/queue-fetch";

const POLL_MS = 15_000;

/** Fila operacional pública — sem autenticação */
export function usePublicQueueData() {
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const data = await fetchEnrichedOperationalQueue();
      setEntries(data);
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

  return { entries, loading, error, refresh: fetchData };
}
