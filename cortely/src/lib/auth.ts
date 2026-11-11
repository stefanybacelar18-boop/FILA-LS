import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import type { SessionUser, StaffRole } from "@/lib/types";
import { demoStore } from "@/lib/demo-store";
import { createServiceClient, isDemoMode } from "@/lib/supabase/env";
import {
  isStaffSessionRevoked,
  isStaffSessionRevokedDurable,
  listPermissionAudit,
} from "@/lib/session-revoke";

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
  ]),
};

type SignedSession = SessionUser & { exp: number; iat: number };

type ClientProofPayload = {
  phone: string;
  shop_id: string;
  exp: number;
  iat: number;
  jti: string;
  kind: "client";
};

const globalClientJti = globalThis as typeof globalThis & {
  __cortelyClientJtiV1?: Map<string, number>;
};

function clientJtiStore() {
  if (!globalClientJti.__cortelyClientJtiV1) {
    globalClientJti.__cortelyClientJtiV1 = new Map();
  }
  return globalClientJti.__cortelyClientJtiV1;
}

export function signingSecret() {
  const fromEnv = process.env.CORTELY_SESSION_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  throw new Error(
    "CORTELY_SESSION_SECRET não configurado (mínimo 16 caracteres)",
  );
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

function sessionFromDemo(parsed: SignedSession): SessionUser | null {
  const live = demoStore.getStaffById(parsed.id);
  if (!live) return null;
  if (
    live.role !== parsed.role ||
    live.barbershop_id !== parsed.barbershop_id
  ) {
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
}

export function parseSessionToken(token: string | undefined | null): SessionUser | null {
  if (!token || !token.includes(".")) return null;
  try {
    const dot = token.lastIndexOf(".");
    const body = token.slice(0, dot);
    const sig = token.slice(dot + 1);
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

    if (isStaffSessionRevoked(parsed.id)) {
      return null;
    }

    // Em demo: staff deve existir no store — removidos são bloqueados imediatamente.
    if (isDemoMode()) {
      return sessionFromDemo(parsed);
    }

    // Produção: HMAC ok; getLiveSession reconcilia com profiles + revogação durável.
    return {
      id: parsed.id,
      email: parsed.email,
      full_name: parsed.full_name,
      role: parsed.role,
      barbershop_id: parsed.barbershop_id,
      barber_id: parsed.barber_id ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Sessão staff reconciliada com estado atual (demo store ou profiles + revogação SQL).
 * Use em todas as rotas administrativas / privadas.
 */
export async function getLiveSession(
  req: NextRequest,
): Promise<SessionUser | null> {
  const session = getRequestSession(req);
  if (!session) return null;

  if (await isStaffSessionRevokedDurable(session.id)) {
    return null;
  }

  if (isDemoMode()) {
    const live = demoStore.getStaffById(session.id);
    if (!live) return null;
    if (
      live.role !== session.role ||
      live.barbershop_id !== session.barbershop_id
    ) {
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
  }

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, role, barbershop_id, barber_id")
      .eq("id", session.id)
      .maybeSingle();
    if (error || !data) return null;
    if (data.barbershop_id !== session.barbershop_id) return null;
    return {
      id: data.id,
      email: data.email,
      full_name: data.full_name,
      role: data.role as StaffRole,
      barbershop_id: data.barbershop_id,
      barber_id: data.barber_id ?? null,
    };
  } catch {
    return null; // fail-closed
  }
}

export function encodeSession(user: SessionUser) {
  const now = Date.now();
  const payload: SignedSession = {
    ...user,
    iat: now,
    exp: now + 60 * 60 * 8 * 1000, // 8h
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${signBody(body)}`;
}

export function getServerSession(): SessionUser | null {
  const jar = cookies();
  return parseSessionToken(jar.get(SESSION_COOKIE)?.value);
}

export function getRequestSession(req: NextRequest): SessionUser | null {
  const fromCookie = parseSessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (fromCookie) return fromCookie;
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return parseSessionToken(auth.slice(7).trim());
  }
  return null;
}

export async function authenticateStaff(email: string, password: string) {
  // Produção: senhas compartilhadas por papel (env) não são autenticação multi-tenant.
  // Até Supabase Auth, login staff só no DEMO MODE.
  if (!isDemoMode()) {
    throw new Error(
      "Login staff em produção exige Supabase Auth (ainda não habilitado). Use DEMO MODE ou complete a migração Auth.",
    );
  }
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

export function requireShopScope(
  session: SessionUser | null,
  barbershopId: string,
) {
  requirePermission(session, "agenda");
  if (session!.barbershop_id !== barbershopId) {
    throw new Error("Sem acesso a esta barbearia");
  }
}

function persistClientJti(payload: ClientProofPayload) {
  if (isDemoMode()) return;
  try {
    const supabase = createServiceClient();
    void supabase.from("client_proof_jtis").upsert({
      jti: payload.jti,
      barbershop_id: payload.shop_id,
      phone: payload.phone,
      expires_at: new Date(payload.exp).toISOString(),
      revoked_at: null,
    });
  } catch {
    /* memory still holds for this instance */
  }
}

/** Token de cliente após OTP — assinado, com shop, jti e validade curta. */
export function encodeClientProof(phoneDigits: string, shopId: string) {
  const now = Date.now();
  const jti = randomUUID();
  const payload: ClientProofPayload = {
    phone: phoneDigits,
    shop_id: shopId,
    exp: now + 60 * 30 * 1000, // 30 min
    iat: now,
    jti,
    kind: "client",
  };
  clientJtiStore().set(jti, payload.exp);
  persistClientJti(payload);
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${signBody(body)}`;
}

function decodeClientProofPayload(
  token: string,
): ClientProofPayload | null {
  if (!token.includes(".")) return null;
  try {
    const [body, sig] = token.split(".");
    if (!body || !sig) return null;
    if (!safeEqual(sig, signBody(body))) return null;
    const parsed = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as Partial<ClientProofPayload>;
    if (parsed.kind !== "client" || !parsed.phone || !parsed.exp || !parsed.jti) {
      return null;
    }
    if (!parsed.shop_id) return null;
    if (parsed.exp < Date.now()) {
      clientJtiStore().delete(parsed.jti);
      return null;
    }
    return parsed as ClientProofPayload;
  } catch {
    return null;
  }
}

export function parseClientProof(
  token: string | undefined | null,
  expectedPhone?: string,
  expectedShopId?: string,
): string | null {
  if (!token) return null;
  const parsed = decodeClientProofPayload(token);
  if (!parsed) return null;
  // jti deve existir (emitido e não revogado) — caminho sync / demo
  if (!clientJtiStore().has(parsed.jti)) return null;
  if (expectedPhone && parsed.phone !== expectedPhone) return null;
  if (expectedShopId && parsed.shop_id !== expectedShopId) return null;
  return parsed.phone;
}

/**
 * Verifica proof de cliente com escopo de loja obrigatório.
 * Em produção também consulta JTIs no Postgres (multi-instância).
 */
export async function verifyClientProof(
  token: string | undefined | null,
  expectedPhone: string,
  expectedShopId: string,
): Promise<string | null> {
  if (!token) return null;
  const parsed = decodeClientProofPayload(token);
  if (!parsed) return null;
  if (parsed.phone !== expectedPhone) return null;
  if (parsed.shop_id !== expectedShopId) return null;

  if (clientJtiStore().has(parsed.jti)) {
    return parsed.phone;
  }

  if (isDemoMode()) return null;

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("client_proof_jtis")
      .select("jti, revoked_at, expires_at")
      .eq("jti", parsed.jti)
      .eq("barbershop_id", expectedShopId)
      .maybeSingle();
    if (error || !data) return null;
    if (data.revoked_at) return null;
    if (new Date(data.expires_at).getTime() < Date.now()) return null;
    // warm memory for subsequent sync checks on this instance
    clientJtiStore().set(parsed.jti, parsed.exp);
    return parsed.phone;
  } catch {
    return null;
  }
}

/** Invalida um proof de cliente (logout / uso único opcional). */
export function revokeClientProof(token: string | undefined | null) {
  if (!token || !token.includes(".")) return;
  try {
    const [body, sig] = token.split(".");
    if (!body || !sig || !safeEqual(sig, signBody(body))) return;
    const parsed = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as Partial<ClientProofPayload>;
    if (parsed.jti) {
      clientJtiStore().delete(parsed.jti);
      if (!isDemoMode()) {
        try {
          const supabase = createServiceClient();
          void supabase
            .from("client_proof_jtis")
            .update({ revoked_at: new Date().toISOString() })
            .eq("jti", parsed.jti);
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
  }
}

export function getPermissionAudit(barbershopId: string) {
  return listPermissionAudit(barbershopId);
}
