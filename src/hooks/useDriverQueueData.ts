"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile, QueueEntry } from "@/lib/types";
import { hasActiveCheckIn } from "@/lib/checkin-rules";
import { fetchEnrichedOperationalQueue } from "@/lib/queue-fetch";
import { isMotoristaOwnEntry, type MotoristaQueueEntry } from "@/lib/queue-public-dto";
import { createDebouncedFn } from "@/lib/debounce";
import {
  MOTORISTA_QUEUE_POLL_CONNECTED_MS,
  MOTORISTA_QUEUE_POLL_MS,
  QUEUE_REALTIME_DEBOUNCE_MS,
} from "@/lib/queue-refresh";

/** Fila do motorista — Realtime (sempre fresco) + poll de backup. */
export function useDriverQueueData(profile: Profile | null) {
  const supabase = useMemo(() => createClient(), []);
  const [entry, setEntry] = useState<QueueEntry | null>(null);
  const [allEntries, setAllEntries] = useState<MotoristaQueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const profileId = profile?.id;

  const applyEntries = useCallback(
    (entries: MotoristaQueueEntry[]) => {
      setAllEntries(entries);
      if (!profileId) return;
      const mineEntries = entries.filter((e) => isMotoristaOwnEntry(e));
      setEntry(hasActiveCheckIn(mineEntries as QueueEntry[]));
      setLoading(false);
    },
    [profileId]
  );

  const fetchData = useCallback(
    async (options?: { bypassCache?: boolean }) => {
      if (!profileId) return;
      const entries = (await fetchEnrichedOperationalQueue(
        supabase,
        options
      )) as MotoristaQueueEntry[];
      applyEntries(entries);
    },
    [supabase, profileId, applyEntries]
  );

  const fetchRoutineRef = useRef(() => fetchData());
  const fetchFreshRef = useRef(() => fetchData({ bypassCache: true }));
  fetchRoutineRef.current = () => fetchData();
  fetchFreshRef.current = () => fetchData({ bypassCache: true });

  useEffect(() => {
    if (!profileId) return;

    setLoading(true);
    void fetchFreshRef.current();

    const debounced = createDebouncedFn(
      () => fetchFreshRef.current(),
      QUEUE_REALTIME_DEBOUNCE_MS
    );

    let pollTimer: number | null = null;

    function startPoll(ms: number) {
      if (pollTimer) window.clearInterval(pollTimer);
      pollTimer = window.setInterval(() => {
        if (document.visibilityState === "visible") {
          void fetchRoutineRef.current();
        }
      }, ms);
    }

    startPoll(MOTORISTA_QUEUE_POLL_MS);

    const channel = supabase
      .channel("motorista-queue-shared")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "queue_entries" },
        () => debounced.call()
      )
      .subscribe((status) => {
        startPoll(
          status === "SUBSCRIBED"
            ? MOTORISTA_QUEUE_POLL_CONNECTED_MS
            : MOTORISTA_QUEUE_POLL_MS
        );
      });

    function onVisible() {
      if (document.visibilityState === "visible") {
        void fetchFreshRef.current();
      }
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      debounced.cancel();
      if (pollTimer) window.clearInterval(pollTimer);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [supabase, profileId]);

  const refresh = useCallback(
    () => fetchData({ bypassCache: true }),
    [fetchData]
  );

  return { entry, allEntries, loading, refresh };
}
