import type { SupabaseClient } from "@supabase/supabase-js";
import { MOTORISTA_HOME } from "@/lib/constants";

/** Sempre inicia em /motorista — GPS no cliente define se pode ir ao check-in. */
export async function resolveMotoristaLandingPath(
  _supabase: SupabaseClient,
  _userId: string
): Promise<string> {
  return MOTORISTA_HOME;
}
