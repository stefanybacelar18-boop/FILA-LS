import { normalizeSupabaseUrl } from "@/lib/supabase/url";

const SUPABASE_URL = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export type OAuthProvider = "google" | "apple";

export type AuthProviderSettings = {
  google: boolean;
  apple: boolean;
  email: boolean;
};

export function getSupabaseProjectRef(): string | null {
  const match = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/);
  return match?.[1] ?? null;
}

export function supabaseDashboardUrl(path: string): string | null {
  const ref = getSupabaseProjectRef();
  if (!ref) return null;
  return `https://supabase.com/dashboard/project/${ref}${path}`;
}

export async function fetchAuthProviderSettings(): Promise<AuthProviderSettings | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  try {
    const { fetchWithTimeout } = await import("@/lib/async-timeout");
    const res = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: SUPABASE_ANON_KEY },
      cache: "no-store",
      timeoutMs: 8_000,
    });
    if (!res.ok) return null;

    const data = (await res.json()) as { external?: Record<string, boolean> };
    const external = data.external ?? {};

    return {
      google: !!external.google,
      apple: !!external.apple,
      email: !!external.email,
    };
  } catch {
    return null;
  }
}

export function oauthCallbackUrl(origin: string): string {
  return `${origin}/auth/callback?context=motorista`;
}

export const GOOGLE_CLOUD_REDIRECT_URI =
  SUPABASE_URL ? `${SUPABASE_URL}/auth/v1/callback` : "";
