"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile, QueueEntry } from "@/lib/types";
import { hasActiveCheckIn } from "@/lib/checkin-rules";
import { fetchEnrichedOperationalQueue } from "@/lib/queue-fetch";
import { createDebouncedFn } from "@/lib/debounce";

const REALTIME_DEBOUNCE_MS = 1200;

/** Fila do motorista — dados enriquecidos (prioridade, minuta, previsão). */
export function useDriverQueueData(profile: Profile | null) {
  const supabase = createClient();
  const [entry, setEntry] = useState<QueueEntry | null>(null);
  const [allEntries, setAllEntries] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const profileId = profile?.id;

  const fetchData = useCallback(async () => {
    if (!profileId) return;

    const { data: myEntries } = await supabase
      .from("queue_entries")
      .select("*")
      .eq("driver_user_id", profileId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(10);

    const mine = hasActiveCheckIn((myEntries as QueueEntry[]) ?? []);
    setEntry(mine);
    setAllEntries(await fetchEnrichedOperationalQueue(supabase));
    setLoading(false);
  }, [supabase, profileId]);

  const fetchRef = useRef(fetchData);
  fetchRef.current = fetchData;

  useEffect(() => {
    if (!profileId) return;

    setLoading(true);
    void fetchRef.current();

    const debounced = createDebouncedFn(() => fetchRef.current(), REALTIME_DEBOUNCE_MS);

    const channel = supabase
      .channel("motorista-queue-shared")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "queue_entries" },
        () => debounced.call()
      )
      .subscribe();

    return () => {
      debounced.cancel();
      supabase.removeChannel(channel);
    };
  }, [supabase, profileId]);

  return { entry, allEntries, loading, refresh: fetchData };
}
