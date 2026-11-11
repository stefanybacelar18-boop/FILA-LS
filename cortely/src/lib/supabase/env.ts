import { createClient } from "@supabase/supabase-js";

/**
 * Demo mode: sem Supabase OU NEXT_PUBLIC_DEMO_MODE=true.
 * Em demo, agenda/CRM/ops persistem em `.data/cortely-store.json` (não zera ao reiniciar).
 */
export function isDemoMode() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return true;
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return true;
  return false;
}

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error("Supabase não configurado. Use o DEMO MODE ou preencha .env.local");
  }

  // Em produção multi-tenant: exigir service role (nunca cair no anon).
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!isDemoMode()) {
    if (!serviceKey) {
      throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY obrigatório fora do DEMO MODE",
      );
    }
    return createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  const key = serviceKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error("Supabase não configurado. Use o DEMO MODE ou preencha .env.local");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
