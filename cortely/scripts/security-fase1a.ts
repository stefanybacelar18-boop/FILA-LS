/**
 * Testes Etapa 1.A — Auth foundation, HMAC fora de prod, revogação por iat.
 * Executar: npx tsx scripts/security-fase1a.ts
 */
import assert from "node:assert/strict";

process.env.CORTELY_SESSION_SECRET ??=
  "ci-session-secret-at-least-16-chars";
process.env.NEXT_PUBLIC_DEMO_MODE ??= "true";
process.env.CORTELY_OWNER_PASSWORD ??= "ownerpass123";
process.env.CORTELY_RECEPTION_PASSWORD ??= "reception123";
process.env.CORTELY_BARBER_PASSWORD ??= "barberpass123";

async function main() {
  let passed = 0;
  function ok(name: string) {
    passed += 1;
    console.log(`✓ ${name}`);
  }

  const auth = await import("../src/lib/auth");
  const revoke = await import("../src/lib/session-revoke");
  const { demoStore } = await import("../src/lib/demo-store");
  const { isDemoMode } = await import("../src/lib/supabase/env");

  assert.equal(isDemoMode(), true);
  ok("demo mode active for local suite");

  const staff = demoStore.listStaff(
    "11111111-1111-4111-8111-111111111111",
  )[0];
  assert.ok(staff);

  const tok = auth.encodeSession({
    id: staff.id,
    email: staff.email,
    full_name: staff.full_name,
    role: staff.role,
    barbershop_id: staff.barbershop_id,
    barber_id: staff.barber_id,
  });
  assert.ok(auth.parseSessionToken(tok));
  ok("demo HMAC session parses");

  // Produção: parseSessionToken (HMAC) deve retornar null
  const prev = process.env.NEXT_PUBLIC_DEMO_MODE;
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_DEMO_MODE = "false";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  // re-import isDemoMode reads env live
  assert.equal(auth.parseSessionToken(tok), null);
  ok("production rejects HMAC legacy session token");
  process.env.NEXT_PUBLIC_DEMO_MODE = prev;
  process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevAnon;

  // Revogação por iat: token antigo rejeitado; novo login ok
  const before = auth.encodeSession({
    id: staff.id,
    email: staff.email,
    full_name: staff.full_name,
    role: staff.role,
    barbershop_id: staff.barbershop_id,
    barber_id: staff.barber_id,
  });
  await new Promise((r) => setTimeout(r, 5));
  revoke.revokeStaffSessions({
    staffId: staff.id,
    barbershopId: staff.barbershop_id,
    reason: "fase1a_test",
  });
  assert.equal(auth.parseSessionToken(before), null);
  ok("revoked: old token rejected before natural expiry");

  await new Promise((r) => setTimeout(r, 5));
  const after = auth.encodeSession({
    id: staff.id,
    email: staff.email,
    full_name: staff.full_name,
    role: staff.role,
    barbershop_id: staff.barbershop_id,
    barber_id: staff.barber_id,
  });
  assert.ok(auth.parseSessionToken(after));
  ok("new login after revoke is allowed (iat >= revoked_at)");
  revoke.clearStaffRevocation(staff.id);

  // RBAC distinct
  assert.equal(auth.roleCan("owner", "financeiro"), true);
  assert.equal(auth.roleCan("barber", "financeiro"), false);
  assert.equal(auth.roleCan("reception", "usuarios"), false);
  assert.equal(auth.roleCan("reception", "caixa"), true);
  ok("RBAC owner vs barber vs reception");

  // authenticateStaff blocked outside demo
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

  // Cookie names / helpers export
  const cookies = await import("../src/lib/supabase/auth-cookies");
  assert.ok(cookies.SB_ACCESS_COOKIE);
  assert.ok(cookies.SB_REFRESH_COOKIE);
  ok("supabase auth cookie names defined");

  const staffAuth = await import("../src/lib/supabase/staff-auth");
  assert.equal(staffAuth.jwtIssuedAtMs("a.b"), undefined);
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

  console.log(`\nSecurity fase 1.A: ${passed} checks passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
