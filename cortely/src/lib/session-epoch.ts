/**
 * Estratégia definitiva de revogação de sessões staff (Etapa 1.A)
 * =================================================================
 *
 * Problema com `iat` puro:
 * - JWT Supabase: `iat` em **segundos** Unix (precisão de 1s).
 * - HMAC demo: `iat` em **milissegundos** (`Date.now()`).
 * - Dois tokens emitidos no mesmo segundo JWT compartilham o mesmo `iat`,
 *   então comparar só `iat` vs `revoked_at` NÃO distingue
 *   “token antigo no segundo da revogação” de “novo login no mesmo segundo”.
 *
 * Estratégia:
 * 1. Cada profile/staff tem `session_generation` (inteiro monotônico).
 * 2. No login, a geração atual é gravada no cookie httpOnly `cortely_sg`
 *    (e no payload HMAC em demo).
 * 3. Em revoke / delete / role-change / deactivate: `session_generation += 1`
 *    (+ audit em staff_session_revocations).
 * 4. `getLiveSession` exige cookie/payload `sg === profile.session_generation`.
 *    Tokens antigos falham na **próxima** request mesmo antes do exp do JWT.
 * 5. Novo login (mesmo segundo) lê a nova geração e funciona.
 *
 * `iat` permanece só como defesa auxiliar / observabilidade — não é o gate.
 */

export const SESSION_GENERATION_COOKIE = "cortely_sg";

export function parseSessionGeneration(
  value: string | undefined | null,
): number | null {
  if (value == null || value === "") return null;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

/** JWT iat (segundos) → ms. Valores já em ms (> 1e12) passam direto. */
export function normalizeTokenIssuedAtMs(
  iatFromToken: number | undefined | null,
): number | null {
  if (iatFromToken == null || !Number.isFinite(iatFromToken)) return null;
  // Heurística: epoch seconds ~1e9; epoch ms ~1e12
  if (iatFromToken < 1_000_000_000_000) return Math.trunc(iatFromToken * 1000);
  return Math.trunc(iatFromToken);
}
