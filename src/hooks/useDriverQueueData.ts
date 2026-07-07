"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile, QueueEntry } from "@/lib/types";
import { hasActiveCheckIn } from "@/lib/checkin-rules";
import { fetchEnrichedOperationalQueue } from "@/lib/queue-fetch";
import { createDebouncedFn } from "@/lib/debounce";
import {
  MOTORISTA_QUEUE_POLL_MS,
  QUEUE_REALTIME_DEBOUNCE_MS,
} from "@/lib/queue-refresh";

/** Fila do motorista — polling + Realtime na própria linha (RLS limita o restante). */
export function useDriverQueueData(profile: Profile | null) {
  const supabase = useMemo(() => createClient(), []);
  const [entry, setEntry] = useState<QueueEntry | null>(null);
  const [allEntries, setAllEntries] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const profileId = profile?.id;

  const fetchData = useCallback(async () => {
    if (!profileId) return;

    const entries = await fetchEnrichedOperationalQueue(supabase);
    setAllEntries(entries);

    const mineEntries = entries.filter((e) => e.driver_user_id === profileId);
    setEntry(hasActiveCheckIn(mineEntries));
    setLoading(false);
  }, [supabase, profileId]);

  const fetchRef = useRef(fetchData);
  fetchRef.current = fetchData;

  useEffect(() => {
    if (!profileId) return;

    setLoading(true);
    void fetchRef.current();

    const debounced = createDebouncedFn(
      () => fetchRef.current(),
      QUEUE_REALTIME_DEBOUNCE_MS
    );

    const channel = supabase
      .channel("motorista-queue-shared")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "queue_entries" },
        () => debounced.call()
      )
      .subscribe();

    const pollTimer = window.setInterval(
      () => void fetchRef.current(),
      MOTORISTA_QUEUE_POLL_MS
    );

    function onVisible() {
      if (document.visibilityState === "visible") {
        void fetchRef.current();
      }
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      debounced.cancel();
      window.clearInterval(pollTimer);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [supabase, profileId]);

  return { entry, allEntries, loading, refresh: fetchData };
}
