import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { completeMotoristaLogin } from "@/lib/auth-profile";
import { resolveMotoristaLandingPath } from "@/lib/motorista-routing";

function isSafeInternalPath(path: string | null | undefined): path is string {
  return Boolean(path && path.startsWith("/") && !path.startsWith("//"));
}

/** Supabase às vezes devolve ?code= na Site URL (/) em vez de /auth/callback. */
export function recoverOAuthCodeFromUrl(context: "motorista" | "staff" = "motorista"): boolean {
  if (typeof window === "undefined") return false;

  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  if (!code) return false;

  const params = new URLSearchParams({ code, context });
  const next = url.searchParams.get("next");
  if (next && isSafeInternalPath(next)) {
    params.set("next", next);
  }

  window.location.replace(`/auth/callback?${params.toString()}`);
  return true;
}

export async function redirectAuthenticatedMotorista(
  supabase: SupabaseClient,
  router: AppRouterInstance,
  options?: { nextPath?: string | null; userId?: string }
): Promise<boolean> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return false;

  try {
    const profile = await completeMotoristaLogin();
    const defaultPath = await resolveMotoristaLandingPath(
      supabase,
      options?.userId ?? profile.id
    );
    const destination = isSafeInternalPath(options?.nextPath) ? options.nextPath : defaultPath;
    router.replace(destination);
    return true;
  } catch {
    await supabase.auth.signOut();
    return false;
  }
}

export async function waitForSupabaseSession(
  supabase: SupabaseClient,
  attempts = 6,
  delayMs = 350
): Promise<boolean> {
  for (let i = 0; i < attempts; i += 1) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) return true;
    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return false;
}
