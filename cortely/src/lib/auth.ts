import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import type { SessionUser, StaffRole } from "@/lib/types";
import { demoStore } from "@/lib/demo-store";

export const SESSION_COOKIE = "cortely_session";

const OWNER = new Set([
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
  "caixa",
  "estoque",
  "financeiro",
  "comissoes",
  "pacotes",
  "waitlist",
  "marketing",
  "relatorios",
  "unidades",
]);

const ROLE_PERMISSIONS: Record<StaffRole, Set<string>> = {
  owner: OWNER,
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
    "caixa",
    "estoque",
    "pacotes",
    "waitlist",
    "marketing",
  ]),
  barber: new Set([
    "agenda",
    "bloqueios",
    "mark_status",
    "manage_blocks",
    "comissoes",
  ]),
};

type SignedSession = SessionUser & { exp: number };

function signingSecret() {
  const fromEnv = process.env.CORTELY_SESSION_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  const g = globalThis as typeof globalThis & { __cortelySessionSecret?: string };
  if (!g.__cortelySessionSecret) {
    g.__cortelySessionSecret = randomBytes(32).toString("hex");
  }
  return g.__cortelySessionSecret;
}

function signBody(body: string) {
  return createHmac("sha256", signingSecret()).update(body).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function roleCan(role: StaffRole, permission: string) {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

export function parseSessionToken(token: string | undefined | null): SessionUser | null {
  if (!token || !token.includes(".")) return null;
  try {
    const [body, sig] = token.split(".");
    if (!body || !sig) return null;
    const expected = signBody(body);
    if (!safeEqual(sig, expected)) return null;

    const parsed = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as SignedSession;
    if (!parsed?.id || !parsed?.role || !parsed?.barbershop_id || !parsed.exp) {
      return null;
    }
    if (parsed.exp < Date.now()) return null;

    const live = demoStore.getStaffById(parsed.id);
    if (!live) return null;
    if (live.role !== parsed.role || live.barbershop_id !== parsed.barbershop_id) {
      return null;
    }

    return {
      id: live.id,
      email: live.email,
      full_name: live.full_name,
      role: live.role,
      barbershop_id: live.barbershop_id,
      barber_id: live.barber_id,
    };
  } catch {
    return null;
  }
}

export function encodeSession(user: SessionUser) {
  const payload: SignedSession = {
    ...user,
    exp: Date.now() + 60 * 60 * 24 * 14 * 1000,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${signBody(body)}`;
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

/** Token de cliente após OTP — assinado e com validade curta. */
export function encodeClientProof(phoneDigits: string) {
  const payload = {
    phone: phoneDigits,
    exp: Date.now() + 60 * 60 * 2 * 1000,
    kind: "client" as const,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${signBody(body)}`;
}

export function parseClientProof(
  token: string | undefined | null,
  expectedPhone?: string,
): string | null {
  if (!token || !token.includes(".")) return null;
  try {
    const [body, sig] = token.split(".");
    if (!body || !sig) return null;
    if (!safeEqual(sig, signBody(body))) return null;
    const parsed = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as { phone?: string; exp?: number; kind?: string };
    if (parsed.kind !== "client" || !parsed.phone || !parsed.exp) return null;
    if (parsed.exp < Date.now()) return null;
    if (expectedPhone && parsed.phone !== expectedPhone) return null;
    return parsed.phone;
  } catch {
    return null;
  }
}
