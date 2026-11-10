import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import type { SessionUser, StaffRole } from "@/lib/types";
import { demoStore } from "@/lib/demo-store";
import { isDemoMode } from "@/lib/supabase/env";

export const SESSION_COOKIE = "cortely_session";

const ROLE_PERMISSIONS: Record<StaffRole, Set<string>> = {
  owner: new Set([
    "agenda",
    "servicos",
    "equipe",
    "horarios",
    "bloqueios",
    "clientes",
    "lembretes",
    "fidelidade",
    "config",
    "usuarios",
    "mark_status",
    "manage_blocks",
    "manage_clients",
  ]),
  reception: new Set([
    "agenda",
    "horarios",
    "bloqueios",
    "clientes",
    "lembretes",
    "fidelidade",
    "mark_status",
    "manage_blocks",
    "manage_clients",
  ]),
  barber: new Set([
    "agenda",
    "bloqueios",
    "mark_status",
    "manage_blocks",
  ]),
};

export function roleCan(role: StaffRole, permission: string) {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

export function parseSessionToken(token: string | undefined | null): SessionUser | null {
  if (!token) return null;
  try {
    const raw = Buffer.from(token, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as SessionUser;
    if (!parsed?.id || !parsed?.role || !parsed?.barbershop_id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function encodeSession(user: SessionUser) {
  return Buffer.from(JSON.stringify(user), "utf8").toString("base64url");
}

export function getServerSession(): SessionUser | null {
  const jar = cookies();
  return parseSessionToken(jar.get(SESSION_COOKIE)?.value);
}

export function getRequestSession(req: NextRequest): SessionUser | null {
  return parseSessionToken(req.cookies.get(SESSION_COOKIE)?.value);
}

export async function authenticateStaff(email: string, password: string) {
  const normalized = email.trim().toLowerCase();
  if (isDemoMode()) {
    const user = demoStore.authenticate(normalized, password);
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      barbershop_id: user.barbershop_id,
      barber_id: user.barber_id,
    };
  }

  // Caminho Supabase: use service role para localizar profile por e-mail demo
  // até o Auth UI completo. Em produção, troque por supabase.auth.signInWithPassword.
  const user = demoStore.authenticate(normalized, password);
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    barbershop_id: user.barbershop_id,
    barber_id: user.barber_id,
  };
}

export function requirePermission(session: SessionUser | null, permission: string) {
  if (!session) throw new Error("Faça login para continuar");
  if (!roleCan(session.role, permission)) {
    throw new Error("Sem permissão para esta ação");
  }
}
