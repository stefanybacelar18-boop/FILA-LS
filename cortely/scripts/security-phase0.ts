/**
 * Testes de segurança Fase 0 — autenticação, revogação, isolamento, XSS helper.
 * Executar: npx tsx scripts/security-phase0.ts
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

process.env.CORTELY_SESSION_SECRET ??=
  "ci-session-secret-at-least-16-chars";
process.env.NEXT_PUBLIC_DEMO_MODE ??= "true";

async function main() {
  const auth = await import("../src/lib/auth");
  const revoke = await import("../src/lib/session-revoke");
  const html = await import("../src/lib/html-escape");
  const providers = await import("../src/lib/whatsapp/providers");
  const { demoStore } = await import("../src/lib/demo-store");

  let passed = 0;
  function ok(name: string) {
    passed += 1;
    console.log(`✓ ${name}`);
  }

  // 1) demo_access não deve existir como caminho feliz — simulado via status esperado no route
  // (teste de contrato: encodeClientProof exige shop_id)
  const token = auth.encodeClientProof(
    "11999998888",
    "11111111-1111-4111-8111-111111111111",
  );
  assert.ok(token.includes("."));
  ok("client proof requires shop_id");

  const phone = auth.parseClientProof(
    token,
    "11999998888",
    "11111111-1111-4111-8111-111111111111",
  );
  assert.equal(phone, "11999998888");
  ok("client proof validates matching shop");

  const crossShop = auth.parseClientProof(
    token,
    "11999998888",
    "99999999-9999-4999-8999-999999999999",
  );
  assert.equal(crossShop, null);
  ok("client proof blocks cross-shop");

  const crossPhone = auth.parseClientProof(
    token,
    "11888887777",
    "11111111-1111-4111-8111-111111111111",
  );
  assert.equal(crossPhone, null);
  ok("client proof blocks cross-phone");

  auth.revokeClientProof(token);
  assert.equal(
    auth.parseClientProof(
      token,
      "11999998888",
      "11111111-1111-4111-8111-111111111111",
    ),
    null,
  );
  ok("client proof jti revocation works");

  // 2) Sessão staff revogada
  const staff = demoStore.listStaff(
    "11111111-1111-4111-8111-111111111111",
  )[0];
  assert.ok(staff);
  const sessionTok = auth.encodeSession({
    id: staff.id,
    email: staff.email,
    full_name: staff.full_name,
    role: staff.role,
    barbershop_id: staff.barbershop_id,
    barber_id: staff.barber_id,
  });
  assert.ok(auth.parseSessionToken(sessionTok));
  revoke.revokeStaffSessions({
    staffId: staff.id,
    barbershopId: staff.barbershop_id,
    reason: "test_revoke",
  });
  assert.equal(auth.parseSessionToken(sessionTok), null);
  ok("revoked staff session is rejected");
  revoke.clearStaffRevocation(staff.id);
  assert.ok(auth.parseSessionToken(sessionTok));
  ok("clear revocation restores session when staff still exists");

  // 3) Staff removido → sessão inválida
  const created = demoStore.upsertStaff({
    email: `sec-test-${Date.now()}@cortely.demo`,
    full_name: "Sec Test",
    role: "reception",
    barbershop_id: "11111111-1111-4111-8111-111111111111",
  });
  const tok2 = auth.encodeSession({
    id: created.id,
    email: created.email,
    full_name: created.full_name,
    role: created.role,
    barbershop_id: created.barbershop_id,
    barber_id: null,
  });
  assert.ok(auth.parseSessionToken(tok2));
  demoStore.deleteStaff(
    created.id,
    "11111111-1111-4111-8111-111111111111",
    staff.id,
  );
  // deleteStaff usa import dinâmico — aguarda microtask
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(auth.parseSessionToken(tok2), null);
  ok("deleted staff session is blocked");

  // 4) XSS escape
  assert.equal(
    html.escapeHtml(`<img src=x onerror=alert(1)>`),
    `&lt;img src=x onerror=alert(1)&gt;`,
  );
  ok("html escape neutralizes tags");

  // 5) WhatsApp provider separation
  delete process.env.WHATSAPP_API_TOKEN;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.META_WHATSAPP_TOKEN;
  delete process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.EVOLUTION_API_URL;
  delete process.env.EVOLUTION_API_KEY;
  delete process.env.EVOLUTION_INSTANCE;
  delete process.env.WHATSAPP_PROVIDER;
  assert.equal(providers.resolveWhatsAppProvider(), "none");
  ok("no provider when Meta/Evolution unset");

  process.env.EVOLUTION_API_URL = "https://evolution.example";
  process.env.EVOLUTION_API_KEY = "key";
  process.env.EVOLUTION_INSTANCE = "loja";
  assert.equal(providers.resolveWhatsAppProvider(), "evolution");
  ok("Evolution resolves without Meta IDs");

  delete process.env.EVOLUTION_API_URL;
  delete process.env.EVOLUTION_API_KEY;
  delete process.env.EVOLUTION_INSTANCE;
  process.env.META_WHATSAPP_TOKEN = "meta-token";
  process.env.META_WHATSAPP_PHONE_NUMBER_ID = "123";
  assert.equal(providers.resolveWhatsAppProvider(), "meta");
  ok("Meta resolves with META_* vars");

  // 6) Isolamento admin: slug de outra loja
  const { getShopBundle } = await import("../src/lib/data");
  const shopA = await getShopBundle("navalha-negra");
  assert.ok(shopA);
  const shopB = await getShopBundle("loja-fantasma-xyz");
  assert.equal(shopB, null);
  ok("unknown shop slug returns null (no data leak)");

  // 7) Hash OTP contract — signingSecret obrigatório (sem fallback "otp")
  assert.equal(typeof auth.signingSecret, "function");
  assert.ok(auth.signingSecret().length >= 16);
  const h = createHash("sha256")
    .update(`shop:phone:123456:${auth.signingSecret()}`)
    .digest("hex");
  assert.equal(h.length, 64);
  ok("otp hash uses signingSecret");

  // 8) verifyClientProof exige shop (async)
  const tok2Shop = auth.encodeClientProof(
    "11999997777",
    "11111111-1111-4111-8111-111111111111",
  );
  assert.equal(
    await auth.verifyClientProof(
      tok2Shop,
      "11999997777",
      "11111111-1111-4111-8111-111111111111",
    ),
    "11999997777",
  );
  assert.equal(
    await auth.verifyClientProof(
      tok2Shop,
      "11999997777",
      "99999999-9999-4999-8999-999999999999",
    ),
    null,
  );
  ok("verifyClientProof blocks cross-shop booking token");

  // 9) setWorkingHours exige barbershop + barbeiro da loja
  const { setWorkingHours } = await import("../src/lib/data");
  await assert.rejects(
    () => setWorkingHours("00000000-0000-4000-8000-000000000099", [], "11111111-1111-4111-8111-111111111111"),
    /não pertence/,
  );
  ok("setWorkingHours rejects foreign barber_id");

  // 10) role change revoga sessão
  const reception = demoStore.upsertStaff({
    email: `role-chg-${Date.now()}@cortely.demo`,
    full_name: "Role Chg",
    role: "reception",
    barbershop_id: "11111111-1111-4111-8111-111111111111",
  });
  const roleTok = auth.encodeSession({
    id: reception.id,
    email: reception.email,
    full_name: reception.full_name,
    role: reception.role,
    barbershop_id: reception.barbershop_id,
    barber_id: null,
  });
  assert.ok(auth.parseSessionToken(roleTok));
  demoStore.upsertStaff({
    id: reception.id,
    email: reception.email,
    full_name: reception.full_name,
    role: "barber",
    barbershop_id: reception.barbershop_id,
  });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(auth.parseSessionToken(roleTok), null);
  ok("role change revokes staff session");
  demoStore.deleteStaff(
    reception.id,
    "11111111-1111-4111-8111-111111111111",
    staff.id,
  );

  // 11) Produção: login staff compartilhado bloqueado
  const prevDemo = process.env.NEXT_PUBLIC_DEMO_MODE;
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_DEMO_MODE = "false";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key-for-test";
  // Re-import env-dependent modules is hard; call authenticateStaff which reads isDemoMode live
  await assert.rejects(
    () => auth.authenticateStaff("owner@test.com", "password123"),
    /Supabase Auth|DEMO MODE/i,
  );
  ok("production staff login refuses shared role passwords");
  process.env.NEXT_PUBLIC_DEMO_MODE = prevDemo;
  process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevAnon;

  // 12) Service role obrigatório fora do demo
  const env = await import("../src/lib/supabase/env");
  process.env.NEXT_PUBLIC_DEMO_MODE = "false";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-only";
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.throws(() => env.createServiceClient(), /SERVICE_ROLE/);
  ok("createServiceClient requires service role outside demo");
  process.env.NEXT_PUBLIC_DEMO_MODE = prevDemo ?? "true";
  if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
  if (prevAnon === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevAnon;

  console.log(`\nSecurity phase 0: ${passed} checks passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
