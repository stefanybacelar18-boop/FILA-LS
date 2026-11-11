import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { createServiceClient, isDemoMode } from "@/lib/supabase/env";
import {
  SB_ACCESS_COOKIE,
  SB_REFRESH_COOKIE,
} from "@/lib/supabase/auth-cookies";

export function createAuthAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Supabase Auth não configurado");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function readAccessTokenFromRequest(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const t = auth.slice(7).trim();
    if (t && !t.includes(".")) return null;
    // HMAC legado tem um ponto; JWT Supabase tem dois.
    if (t.split(".").length === 3) return t;
    return null;
  }
  const fromCookie = req.cookies.get(SB_ACCESS_COOKIE)?.value;
  return fromCookie?.trim() || null;
}

export async function getSupabaseAuthUser(accessToken: string) {
  const supabase = createAuthAnonClient();
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return data.user;
}

/** Decodifica iat do JWT sem verificar (a verificação é getUser). */
export function jwtIssuedAtMs(accessToken: string): number | undefined {
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return undefined;
    const json = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { iat?: number };
    return typeof json.iat === "number" ? json.iat * 1000 : undefined;
  } catch {
    return undefined;
  }
}

export async function loadActiveStaffProfile(userId: string) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, email, full_name, role, barbershop_id, barber_id, is_active, provisioning_status, session_generation",
    )
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  if (data.is_active === false) return null;
  if (data.provisioning_status && data.provisioning_status !== "ready") {
    return null;
  }
  if (!data.barbershop_id) return null;
  return data;
}

export { SB_ACCESS_COOKIE, SB_REFRESH_COOKIE, isDemoMode };
