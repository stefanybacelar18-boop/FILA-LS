/**
 * Testes Etapa 1.A — Auth, session_generation, HMAC fora de prod, RBAC, isolamento.
 * Evidências impressas no stdout (CI captura o log).
 */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";

process.env.CORTELY_SESSION_SECRET ??=
  "ci-session-secret-at-least-16-chars";
process.env.NEXT_PUBLIC_DEMO_MODE ??= "true";
process.env.CORTELY_OWNER_PASSWORD ??= "ownerpass123";
process.env.CORTELY_RECEPTION_PASSWORD ??= "reception123";
process.env.CORTELY_BARBER_PASSWORD ??= "barberpass123";

const evidence: string[] = [];
function note(line: string) {
  evidence.push(line);
  console.log(line);
}

async function main() {
  let passed = 0;
  function ok(name: string) {
    passed += 1;
    note(`✓ ${name}`);
  }

  const auth = await import("../src/lib/auth");
  const revoke = await import("../src/lib/session-revoke");
  const epoch = await import("../src/lib/session-epoch");
  const { demoStore } = await import("../src/lib/demo-store");
  const { isDemoMode } = await import("../src/lib/supabase/env");

  assert.equal(isDemoMode(), true);
  ok("demo mode active for local suite");

  // --- Unidades iat ---
  assert.equal(epoch.normalizeTokenIssuedAtMs(1_700_000_000), 1_700_000_000_000);
  assert.equal(epoch.normalizeTokenIssuedAtMs(1_700_000_000_000), 1_700_000_000_000);
  note(
    `EVIDENCE iat units: JWT-sec 1700000000 → ms ${epoch.normalizeTokenIssuedAtMs(1_700_000_000)}; already-ms unchanged`,
  );
  ok("normalizeTokenIssuedAtMs distinguishes seconds vs ms");

  const staff = demoStore.listStaff(
    "11111111-1111-4111-8111-111111111111",
  )[0];
  assert.ok(staff);
  const live0 = demoStore.getStaffById(staff.id)!;
  const sg0 = live0.session_generation ?? 1;
  note(`EVIDENCE staff ${staff.email} session_generation=${sg0}`);

  const tok = auth.encodeSession({
    id: staff.id,
    email: staff.email,
    full_name: staff.full_name,
    role: staff.role,
    barbershop_id: staff.barbershop_id,
    barber_id: staff.barber_id,
  });
  assert.ok(auth.parseSessionToken(tok));
  ok("demo HMAC session parses with matching sg");

  // Produção rejeita HMAC
  const prev = process.env.NEXT_PUBLIC_DEMO_MODE;
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_DEMO_MODE = "false";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  assert.equal(auth.parseSessionToken(tok), null);
  note("EVIDENCE production parseSessionToken(HMAC)=null");
  ok("production rejects HMAC legacy session token");
  process.env.NEXT_PUBLIC_DEMO_MODE = prev;
  process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevAnon;

  // --- Revogação por generation (mesmo "segundo") ---
  const before = auth.encodeSession({
    id: staff.id,
    email: staff.email,
    full_name: staff.full_name,
    role: staff.role,
    barbershop_id: staff.barbershop_id,
    barber_id: staff.barber_id,
  });
  const revokedAtMs = Date.now();
  revoke.revokeStaffSessions({
    staffId: staff.id,
    barbershopId: staff.barbershop_id,
    reason: "fase1a_generation_test",
  });
  const sg1 = demoStore.getStaffById(staff.id)!.session_generation ?? 1;
  note(
    `EVIDENCE revoke at ms=${revokedAtMs}; sg ${sg0}→${sg1}; old token parse=${auth.parseSessionToken(before) === null ? "null" : "LEAK"}`,
  );
  assert.equal(auth.parseSessionToken(before), null);
  ok("revoked: old token rejected (sg mismatch) before natural expiry");

  // Novo login no mesmo instante/segundo
  const afterSameSecond = auth.encodeSession({
    id: staff.id,
    email: staff.email,
    full_name: staff.full_name,
    role: staff.role,
    barbershop_id: staff.barbershop_id,
    barber_id: staff.barber_id,
  });
  assert.ok(auth.parseSessionToken(afterSameSecond));
  note(
    `EVIDENCE same-second new login parse=ok sg=${sg1} (iat comparison alone would be ambiguous for JWT)`,
  );
  ok("new login after revoke works in the same second (generation gate)");

  // clearStaffRevocation NÃO revalida token antigo
  revoke.clearStaffRevocation(staff.id);
  assert.equal(auth.parseSessionToken(before), null);
  note("EVIDENCE clearStaffRevocation does not resurrect old sg token");
  ok("clearing revoke marker does not revive old generation tokens");

  // --- RBAC ---
  assert.equal(auth.roleCan("owner", "financeiro"), true);
  assert.equal(auth.roleCan("barber", "financeiro"), false);
  assert.equal(auth.roleCan("reception", "usuarios"), false);
  assert.equal(auth.roleCan("reception", "caixa"), true);
  assert.equal(auth.roleCan("barber", "usuarios"), false);
  note(
    "EVIDENCE RBAC owner.financeiro=true barber.financeiro=false reception.usuarios=false",
  );
  ok("RBAC owner vs barber vs reception");

  // --- Isolamento de loja (slug desconhecido) ---
  const { getShopBundle } = await import("../src/lib/data");
  assert.ok(await getShopBundle("navalha-negra"));
  assert.equal(await getShopBundle("outra-empresa-xyz"), null);
  note("EVIDENCE getShopBundle(foreign-slug)=null");
  ok("unknown shop slug returns null (no cross-tenant catalog leak)");

  // --- Staff invite path exists (demo) + tenant binding ---
  const { inviteStaffMember } = await import("../src/lib/data");
  const invited = await inviteStaffMember({
    email: `invite-${Date.now()}@cortely.demo`,
    full_name: "Convidado Teste",
    role: "reception",
    barbershop_id: "11111111-1111-4111-8111-111111111111",
  });
  assert.equal(invited.barbershop_id, "11111111-1111-4111-8111-111111111111");
  assert.equal(invited.role, "reception");
  note(
    `EVIDENCE inviteStaffMember demo → id=${invited.id} shop=${invited.barbershop_id} role=${invited.role}`,
  );
  ok("inviteStaffMember binds profile to actor barbershop + role");
  demoStore.deleteStaff(
    invited.id,
    "11111111-1111-4111-8111-111111111111",
    staff.id,
  );

  // --- authenticateStaff blocked outside demo ---
  process.env.NEXT_PUBLIC_DEMO_MODE = "false";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  await assert.rejects(
    () => auth.authenticateStaff("a@b.com", "password123"),
    /Supabase Auth|DEMO MODE/i,
  );
  ok("authenticateStaff refuses outside demo");
  process.env.NEXT_PUBLIC_DEMO_MODE = prev ?? "true";
  if (!prevUrl) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
  if (!prevAnon) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevAnon;

  const staffAuth = await import("../src/lib/supabase/staff-auth");
  assert.equal(
    staffAuth.readAccessTokenFromRequest({
      headers: { get: () => "Bearer aaa.bbb.ccc" },
      cookies: { get: () => undefined },
    } as never),
    "aaa.bbb.ccc",
  );
  assert.equal(
    staffAuth.readAccessTokenFromRequest({
      headers: { get: () => "Bearer hmacbody.sig" },
      cookies: { get: () => undefined },
    } as never),
    null,
  );
  ok("Bearer JWT accepted; HMAC-shaped bearer ignored in prod helper");

  // --- Proof HMAC: adulteração / replay / cross-user ---
  const accessA = "access-token-user-a-aaaa";
  const accessB = "access-token-user-b-bbbb";
  const uidA = "11111111-1111-4111-8111-111111111101";
  const uidB = "11111111-1111-4111-8111-111111111102";
  const proofA1 = epoch.encodeSessionGenerationProof({
    userId: uidA,
    sessionGeneration: 1,
    accessToken: accessA,
  });
  assert.equal(
    epoch.verifySessionGenerationProof({
      proof: proofA1,
      userId: uidA,
      accessToken: accessA,
      currentGeneration: 1,
    }).ok,
    true,
  );
  note("EVIDENCE valid proof accepts matching uid+sg+ath");

  // Cookie adulterado: inteiro cru
  assert.equal(
    epoch.verifySessionGenerationProof({
      proof: "2",
      userId: uidA,
      accessToken: accessA,
      currentGeneration: 2,
    }).ok,
    false,
  );
  note("EVIDENCE raw integer cookie rejected (missing signature)");

  // Forjar sg nova sem secret (trocar payload)
  const tampered = proofA1.replace(/^../, "xx");
  assert.equal(
    epoch.verifySessionGenerationProof({
      proof: tampered,
      userId: uidA,
      accessToken: accessA,
      currentGeneration: 1,
    }).ok,
    false,
  );
  note("EVIDENCE tampered proof signature rejected");

  // Cookie de outro usuário
  const crossUser = epoch.verifySessionGenerationProof({
    proof: proofA1,
    userId: uidB,
    accessToken: accessA,
    currentGeneration: 1,
  });
  assert.equal(crossUser.ok, false);
  if (!crossUser.ok) assert.equal(crossUser.reason, "uid_mismatch");
  note("EVIDENCE proof of user A rejected for user B (uid_mismatch)");

  // Cookie de outra sessão JWT (mesmo user, outro access token)
  const crossTok = epoch.verifySessionGenerationProof({
    proof: proofA1,
    userId: uidA,
    accessToken: accessB,
    currentGeneration: 1,
  });
  assert.equal(crossTok.ok, false);
  if (!crossTok.ok) assert.equal(crossTok.reason, "token_mismatch");
  note("EVIDENCE proof bound to access_token hash (token_mismatch)");

  // Replay após revoke (sg bumped)
  const replay = epoch.verifySessionGenerationProof({
    proof: proofA1,
    userId: uidA,
    accessToken: accessA,
    currentGeneration: 2,
  });
  assert.equal(replay.ok, false);
  if (!replay.ok) assert.equal(replay.reason, "sg_mismatch");
  note("EVIDENCE revoked generation: old proof sg_mismatch even with valid JWT");

  // Novo login proof após bump
  const proofA2 = epoch.encodeSessionGenerationProof({
    userId: uidA,
    sessionGeneration: 2,
    accessToken: accessA,
  });
  assert.equal(
    epoch.verifySessionGenerationProof({
      proof: proofA2,
      userId: uidA,
      accessToken: accessA,
      currentGeneration: 2,
    }).ok,
    true,
  );
  note("EVIDENCE new proof after revoke accepts sg=2");
  ok("session_generation proof resists tamper/replay/cross-user/cross-token");

  // Contrato de código: fallback createUser sem email_confirm + pending_email
  const { readFileSync } = await import("node:fs");
  const dataSrc = readFileSync(
    new URL("../src/lib/data.ts", import.meta.url),
    "utf8",
  );
  assert.match(dataSrc, /email_confirm:\s*false/);
  assert.match(dataSrc, /provisioning_status:\s*"pending_email"/);
  assert.match(dataSrc, /deleteUser/);
  assert.match(dataSrc, /activateInvitedStaff/);
  note(
    "EVIDENCE inviteStaffMember source: email_confirm:false + pending_email + deleteUser compensation + activateInvitedStaff",
  );
  ok("invite contract: createUser fallback keeps pending_email (code path)");

  // Cookie flags no login (HttpOnly/Secure/SameSite) — não substituem HMAC
  const loginSrc = readFileSync(
    new URL("../src/app/api/auth/login/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(loginSrc, /httpOnly:\s*true/);
  assert.match(loginSrc, /secure:\s*true/);
  assert.match(loginSrc, /sameSite:\s*"lax"/);
  assert.match(loginSrc, /encodeSessionGenerationProof/);
  note("EVIDENCE login sets HttpOnly+Secure+SameSite=Lax + signed cortely_sg proof");
  ok("cortely_sg cookie flags + signed proof emission on login");

  const outPath = "/tmp/cortely-fase1a-evidence.txt";
  writeFileSync(outPath, evidence.join("\n") + `\nPASSED=${passed}\n`, "utf8");
  note(`EVIDENCE file written: ${outPath}`);
  console.log(`\nSecurity fase 1.A: ${passed} checks passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
