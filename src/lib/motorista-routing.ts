import type { SupabaseClient } from "@supabase/supabase-js";
import { MOTORISTA_CHECKIN } from "@/lib/constants";

/** Após login OAuth — vai direto ao check-in; GPS libera o formulário. */
export async function resolveMotoristaLandingPath(
  _supabase: SupabaseClient,
  _userId: string
): Promise<string> {
  return MOTORISTA_CHECKIN;
}
