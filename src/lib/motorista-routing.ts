import type { SupabaseClient } from "@supabase/supabase-js";
import { hasActiveCheckIn } from "@/lib/checkin-rules";
import { MOTORISTA_CHECKIN, MOTORISTA_HOME } from "@/lib/constants";
import type { QueueEntry } from "@/lib/types";

/** Motorista sem check-in ativo vai direto ao formulário; com check-in vai ao painel */
export async function resolveMotoristaLandingPath(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const { data } = await supabase
    .from("queue_entries")
    .select("*")
    .eq("driver_user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const active = hasActiveCheckIn((data as QueueEntry[]) ?? []);
  return active ? MOTORISTA_HOME : MOTORISTA_CHECKIN;
}
