import { createBrowserClient } from "@supabase/ssr";
import { normalizeSupabaseUrl } from "@/lib/supabase/url";

/** Evita falha no `next build` quando env ainda não está configurada (ex.: Vercel). */
function resolveBrowserCredentials() {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (url && key) return { url, key };
  return {
    url: "https://placeholder.supabase.co",
    key: "placeholder-anon-key",
  };
}

export function createClient() {
  const { url, key } = resolveBrowserCredentials();
  return createBrowserClient(url, key, { isSingleton: true });
}
