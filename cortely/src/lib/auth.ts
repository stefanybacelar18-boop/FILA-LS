import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import type { SessionUser, StaffRole } from "@/lib/types";
import { demoStore } from "@/lib/demo-store";
import { createServiceClient, isDemoMode } from "@/lib/supabase/env";
import {
  getSupabaseAuthUser,
  jwtIssuedAtMs,
  loadActiveStaffProfile,
  readAccessTokenFromRequest,
} from "@/lib/supabase/staff-auth";
import { verifySessionGenerationProof } from "@/lib/session-epoch";
import {
  isStaffSessionRevokedDurable,
  listPermissionAudit,
  sessionGenerationMatches,
} from "@/lib/session-revoke";
import { SESSION_GENERATION_COOKIE } from "@/lib/session-epoch";

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

type SignedSession = SessionUser & {
  exp: number;
  iat: number;
  /** session_generation no momento do login */
  sg: number;
};

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
  const currentSg = live.session_generation ?? 1;
  if (!sessionGenerationMatches(parsed.sg, currentSg)) {
    return null;
  }
  return {
    id: live.id,
    email: live.email,
    full_name: live.full_name,
    role: live.role,
    barbershop_id: live.barbershop_id,
    barber_id: live.barber_id,
    session_generation: currentSg,
  };
}

/**
 * Sessão HMAC legada — **somente DEMO MODE**.
 * Em produção o caminho admin usa exclusivamente Supabase Auth JWT.
 */
export function parseSessionToken(token: string | undefined | null): SessionUser | null {
  if (!isDemoMode()) return null;
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
    if (typeof parsed.sg !== "number") return null;

    // Gate principal: session_generation (iat sozinho é insuficiente — ver session-epoch.ts)
    return sessionFromDemo(parsed);
  } catch {
    return null;
  }
}

/**
 * Sessão staff reconciliada com estado atual.
 * - DEMO: cookie HMAC + demoStore + session_generation no payload
 * - PRODUÇÃO: JWT Supabase + cookie cortely_sg + profiles.session_generation
 */
export async function getLiveSession(
  req: NextRequest,
): Promise<SessionUser | null> {
  if (isDemoMode()) {
    const session = getRequestSession(req);
    if (!session) return null;
    // parseSessionToken já valida sg vs demoStore
    return session;
  }

  // Produção: HMAC legado não autentica.
  const accessToken = readAccessTokenFromRequest(req);
  if (!accessToken) return null;

  const user = await getSupabaseAuthUser(accessToken);
  if (!user) return null;

  const profile = await loadActiveStaffProfile(user.id);
  if (!profile) return null;

  const currentSg =
    typeof profile.session_generation === "number"
      ? profile.session_generation
      : 1;

  // Proof HMAC: uid + sg + hash(access_token) — cookie cru/adulterado falha.
  const proof = req.cookies.get(SESSION_GENERATION_COOKIE)?.value;
  const verified = verifySessionGenerationProof({
    proof,
    userId: user.id,
    accessToken,
    currentGeneration: currentSg,
  });
  if (!verified.ok) {
    return null;
  }

  void isStaffSessionRevokedDurable(
    user.id,
    jwtIssuedAtMs(accessToken) ?? undefined,
  );

  return {
    id: profile.id,
    email: profile.email ?? user.email ?? "",
    full_name: profile.full_name ?? "",
    role: profile.role as StaffRole,
    barbershop_id: profile.barbershop_id,
    barber_id: profile.barber_id ?? null,
    session_generation: currentSg,
  };
}

export function encodeSession(user: SessionUser) {
  const now = Date.now();
  const live = isDemoMode() ? demoStore.getStaffById(user.id) : null;
  const sg = live?.session_generation ?? user.session_generation ?? 1;
  const payload: SignedSession = {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    barbershop_id: user.barbershop_id,
    barber_id: user.barber_id,
    sg,
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

/** Demo only — senhas por papel via env. */
export async function authenticateStaff(email: string, password: string) {
  if (!isDemoMode()) {
    throw new Error(
      "Use autenticação Supabase Auth fora do DEMO MODE",
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
    session_generation: user.session_generation ?? 1,
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
