"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { sortQueueEntries } from "@/lib/queue";
import { sanitizeQueueEntries } from "@/lib/sanitize-queue-entry";
import { createDebouncedFn } from "@/lib/debounce";
import { QUEUE_REALTIME_DEBOUNCE_MS } from "@/lib/queue-refresh";
import type { EstoqueCapacitySummary } from "@/lib/estoque-capacity-summary";
import type { QueueEntry } from "@/lib/types";

type UseQueuePanelDataOptions = {
  role: string;
  isAdmin: boolean;
  isEmpilhador: boolean;
};

export function useQueuePanelData({ role, isAdmin, isEmpilhador }: UseQueuePanelDataOptions) {
  const supabase = useMemo(() => createClient(), []);
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [estoqueSummary, setEstoqueSummary] = useState<EstoqueCapacitySummary | null>(null);
  const fetchInFlightRef = useRef(false);

  const fetchQueue = useCallback(
    async (fresh = false) => {
      if (fetchInFlightRef.current) return;
      fetchInFlightRef.current = true;
      setFetchError(null);

      try {
        const needsFullDay = isAdmin || isEmpilhador;

        const params = new URLSearchParams();
        if (isAdmin) params.set("scope", "admin");
        else if (needsFullDay) params.set("scope", "all");
        if (fresh) params.set("_", String(Date.now()));
        const url = `/api/queue/today?${params.toString()}`;

        const res = await fetch(url, { cache: "no-store" });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          data?: QueueEntry[];
          meta?: { estoque?: EstoqueCapacitySummary | null };
        };

        if (!res.ok) {
          setFetchError(json.error ?? "Erro ao carregar fila");
          setEstoqueSummary(null);
          setLoading(false);
          return;
        }

        setEntries(sortQueueEntries(sanitizeQueueEntries(json.data ?? [])));
        setEstoqueSummary(json.meta?.estoque ?? null);
        setLoading(false);
      } finally {
        fetchInFlightRef.current = false;
      }
    },
    [isAdmin, isEmpilhador]
  );

  useEffect(() => {
    fetchQueue();
    const debounced = createDebouncedFn(() => fetchQueue(true), QUEUE_REALTIME_DEBOUNCE_MS);
    const channel = supabase
      .channel(`queue-${role}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "queue_entries" }, () =>
        debounced.call()
      )
      .subscribe();
    return () => {
      debounced.cancel();
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchQueue, role]);

  return {
    entries,
    setEntries,
    loading,
    fetchError,
    estoqueSummary,
    fetchQueue,
  };
}
