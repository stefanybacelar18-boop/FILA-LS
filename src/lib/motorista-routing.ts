import type { SupabaseClient } from "@supabase/supabase-js";
import { MOTORISTA_CHECKIN, MOTORISTA_HOME } from "@/lib/constants";
import { hasActiveCheckIn } from "@/lib/checkin-rules";
import type { QueueEntry } from "@/lib/types";

/** Após login OAuth — fila ativa vai para /motorista; senão check-in. */
export async function resolveMotoristaLandingPath(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const { data } = await supabase
    .from("queue_entries")
    .select("id, status, created_at, driver_user_id")
    .eq("driver_user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(12);

  if (hasActiveCheckIn((data ?? []) as QueueEntry[])) {
    return MOTORISTA_HOME;
  }

  return MOTORISTA_CHECKIN;
}
