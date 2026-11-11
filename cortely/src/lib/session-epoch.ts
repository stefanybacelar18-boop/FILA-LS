/**
 * Estratégia definitiva de revogação de sessões staff (Etapa 1.A)
 * =================================================================
 *
 * JWT Supabase: `iat` em **segundos** — insuficiente sozinho no mesmo segundo.
 * HMAC demo: `iat` em **ms**, com `sg` assinado no próprio token.
 *
 * Produção:
 * - Cookie `cortely_sg` NÃO é um inteiro cru.
 * - É um **proof HMAC** `{ uid, sg, ath }.sig` (ath = hash do access_token).
 * - getLiveSession exige: assinatura válida, uid === JWT.sub, sg === profile,
 *   ath === hash(access_token atual).
 * - Assim: cookie adulterado, cookie de outro user, cookie de outra sessão JWT,
 *   ou replay após revoke (sg antiga) falham. Forjar sg nova exige o secret.
 */

import { createHmac, createHash, timingSafeEqual } from "crypto";

export const SESSION_GENERATION_COOKIE = "cortely_sg";

type SgProofPayload = {
  uid: string;
  sg: number;
  /** SHA-256 hex do access_token (vincula proof à sessão JWT atual) */
  ath: string;
};

function signingSecret() {
  const fromEnv = process.env.CORTELY_SESSION_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  throw new Error("CORTELY_SESSION_SECRET não configurado (mínimo 16 caracteres)");
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

export function hashAccessToken(accessToken: string): string {
  return createHash("sha256").update(accessToken).digest("hex");
}

/** Emite proof assinado para cookie HttpOnly. */
export function encodeSessionGenerationProof(input: {
  userId: string;
  sessionGeneration: number;
  accessToken: string;
}): string {
  const payload: SgProofPayload = {
    uid: input.userId,
    sg: input.sessionGeneration,
    ath: hashAccessToken(input.accessToken),
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${signBody(body)}`;
}

export type SgProofVerifyResult =
  | { ok: true; sg: number }
  | { ok: false; reason: string };

/** Valida proof contra JWT user id + access token + geração atual do profile. */
export function verifySessionGenerationProof(input: {
  proof: string | undefined | null;
  userId: string;
  accessToken: string;
  currentGeneration: number;
}): SgProofVerifyResult {
  if (!input.proof || !input.proof.includes(".")) {
    return { ok: false, reason: "missing_proof" };
  }
  try {
    const dot = input.proof.lastIndexOf(".");
    const body = input.proof.slice(0, dot);
    const sig = input.proof.slice(dot + 1);
    if (!body || !sig || !safeEqual(sig, signBody(body))) {
      return { ok: false, reason: "bad_signature" };
    }
    const parsed = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as Partial<SgProofPayload>;
    if (!parsed.uid || typeof parsed.sg !== "number" || !parsed.ath) {
      return { ok: false, reason: "malformed" };
    }
    if (parsed.uid !== input.userId) {
      return { ok: false, reason: "uid_mismatch" };
    }
    if (parsed.sg !== input.currentGeneration) {
      return { ok: false, reason: "sg_mismatch" };
    }
    if (parsed.ath !== hashAccessToken(input.accessToken)) {
      return { ok: false, reason: "token_mismatch" };
    }
    return { ok: true, sg: parsed.sg };
  } catch {
    return { ok: false, reason: "parse_error" };
  }
}

/** @deprecated Prefer verifySessionGenerationProof — inteiro cru não é seguro. */
export function parseSessionGeneration(
  value: string | undefined | null,
): number | null {
  if (value == null || value === "") return null;
  // Proof assinado contém '.' — não é um inteiro simples
  if (value.includes(".")) return null;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

/** JWT iat (segundos) → ms. Valores já em ms (> 1e12) passam direto. */
export function normalizeTokenIssuedAtMs(
  iatFromToken: number | undefined | null,
): number | null {
  if (iatFromToken == null || !Number.isFinite(iatFromToken)) return null;
  if (iatFromToken < 1_000_000_000_000) return Math.trunc(iatFromToken * 1000);
  return Math.trunc(iatFromToken);
}
