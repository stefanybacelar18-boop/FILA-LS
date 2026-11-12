/**
 * 1.B.3-G — gateway isolado: assinatura, quarentena, apply, registry 503, PIX demo.
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import pg from "pg";
import {
  FakeProvider,
  fakeSign,
  handlePaymentWebhook,
  reprocessQuarantine,
  resolveProvider,
  assertFakePaymentProviderSafeAtBoot,
  FakePaymentBootError,
} from "../src/lib/payments/index";
import {
  bundledRegistrySeedText,
  clearRegistryBootCache,
  loadRegistry,
  OPS_DOMAINS,
  type DomainRegistryEntry,
} from "../src/lib/ops-registry";
import {
  createPaymentIntent,
  PaymentProviderUnavailableError,
} from "../src/lib/payments";

const ROOT = resolve(__dirname, "..");
const SQL_DIR = join(ROOT, "scripts/sql");
const MIG_DIR = join(ROOT, "supabase/migrations");
const EVIDENCE = "/tmp/cortely-fase1b3g-gateway-evidence.txt";
const DB = process.env.CORTELY_FASE1B3G_TEST_DB || "cortely_fase1b3g_gateway_test";
const SECRET = "cortely-fake-test-secret";

/** Env permitido para FakeProvider nos testes. */
function testFakeEnv(
  extra: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    CORTELY_ENABLE_FAKE_PAYMENT_PROVIDER: "true",
    CORTELY_FAKE_PAYMENT_SECRET: SECRET,
    ...extra,
  } as NodeJS.ProcessEnv;
}

const useTcp = Boolean(process.env.PGHOST) || Boolean(process.env.PGPASSWORD);
const SHOP_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SHOP_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function sh(cmd: string) {
  return execSync(cmd, {
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function shellQuote(s: string) {
  if (/^[a-zA-Z0-9_./:@=-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function psqlArgs(db: string, extra: string[]) {
  if (useTcp) {
    return [
      "psql",
      "-h",
      process.env.PGHOST || "127.0.0.1",
      "-p",
      process.env.PGPORT || "5432",
      "-U",
      process.env.PGUSER || "postgres",
      "-d",
      db,
      ...extra,
    ];
  }
  return ["sudo", "-u", "postgres", "psql", "-d", db, ...extra];
}

function psqlCmd(db: string, sql: string) {
  const args = psqlArgs(db, ["-v", "ON_ERROR_STOP=1", "-c", sql]);
  return execSync(args.map(shellQuote).join(" "), {
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function psqlFileAll(db: string, file: string): string {
  const args = psqlArgs(db, ["-v", "ON_ERROR_STOP=1", "-f", file]);
  return execSync(`${args.map(shellQuote).join(" ")} 2>&1`, {
    encoding: "utf8",
    env: process.env,
  });
}

function ensurePostgres() {
  if (useTcp) {
    for (let i = 0; i < 30; i++) {
      try {
        psqlCmd("postgres", "SELECT 1");
        return;
      } catch {
        sh("sleep 2");
      }
    }
    console.error("PostgreSQL TCP indisponível");
    process.exit(1);
  }
  try {
    sh("sudo -u postgres psql -c 'SELECT 1' >/dev/null");
  } catch {
    try {
      sh("sudo pg_ctlcluster 16 main start");
    } catch {
      sh("sudo service postgresql start");
    }
    sh("sudo -u postgres psql -c 'SELECT 1' >/dev/null");
  }
}

function recreateDb(name: string) {
  try {
    psqlCmd("postgres", `DROP DATABASE IF EXISTS ${name}`);
  } catch {
    /* */
  }
  psqlCmd("postgres", `CREATE DATABASE ${name}`);
  psqlCmd(name, "CREATE EXTENSION IF NOT EXISTS pgcrypto");
}

async function counts(pool: pg.Pool) {
  const q = async (t: string) =>
    Number((await pool.query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n);
  return {
    intents: await q("public.payment_intents"),
    events: await q("public.payment_webhook_events"),
    quarantine: await q("public.payment_webhook_quarantine"),
    accounts: await q("public.payment_provider_accounts"),
  };
}

async function main() {
  const evidence: string[] = [];
  const note = (l: string) => {
    evidence.push(l);
    console.log(l);
  };
  let passed = 0;
  const ok = (name: string) => {
    passed += 1;
    note(`✓ ${name}`);
  };

  note("=== Cortely fase1b3g gateway ===");
  ensurePostgres();
  if (!useTcp) {
    try {
      sh(`sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'postgres'"`);
    } catch {
      /* */
    }
  }

  const harness = join(SQL_DIR, "fase1b3g_gateway_harness.sql");
  const mig = join(MIG_DIR, "20261112_fase1b_03g_gateway.sql");
  const tests = join(SQL_DIR, "fase1b3g_gateway_tests.sql");
  for (const f of [harness, mig, tests]) {
    if (!existsSync(f)) {
      console.error("missing", f);
      process.exit(1);
    }
  }

  recreateDb(DB);
  note("Applying harness…");
  psqlFileAll(DB, harness);
  note("Applying migration 20261112_fase1b_03g…");
  psqlFileAll(DB, mig);
  note("Running SQL asserts…");
  const sqlOut = psqlFileAll(DB, tests);
  note(sqlOut.slice(-1800));
  if (!sqlOut.includes("FASE1B3G_GATEWAY_SQL_PASSED")) {
    console.error("missing FASE1B3G_GATEWAY_SQL_PASSED");
    process.exit(1);
  }
  ok("SQL asserts gateway/grants/P16/terminals");

  const pool = new pg.Pool({
    host: process.env.PGHOST || "127.0.0.1",
    port: Number(process.env.PGPORT || "5432"),
    user: process.env.PGUSER || "postgres",
    password: process.env.PGPASSWORD || "postgres",
    database: DB,
  });
  const db = {
    query: async <T extends Record<string, unknown>>(
      text: string,
      params?: unknown[],
    ) => {
      const res = await pool.query(text, params);
      return { rows: res.rows as T[], rowCount: res.rowCount };
    },
  };

  const fake = new FakeProvider(SECRET);
  const shop = SHOP_A;
  await pool.query(
    `INSERT INTO public.barbershops (id, name, slug)
     VALUES ($1,'WA','wa') ON CONFLICT (id) DO NOTHING`,
    [shop],
  );
  await pool.query(
    `INSERT INTO public.payment_provider_accounts (barbershop_id, provider, external_account_id)
     VALUES ($1,'fake','acct_wa') ON CONFLICT (barbershop_id, provider) DO NOTHING`,
    [shop],
  );

  const ref = `ref-wh-${randomUUID().slice(0, 8)}`;
  await pool.query(
    `INSERT INTO public.payment_intents (
       barbershop_id, provider, provider_ref, amount, method, status, purpose
     ) VALUES ($1,'fake',$2,80,'pix','pending','appointment')`,
    [shop, ref],
  );

  // Assinatura inválida → 401, contagens iguais
  const beforeBad = await counts(pool);
  const badBody = JSON.stringify({
    provider_event_id: "evt-bad-sig",
    provider_ref: ref,
    status: "paid",
    amount: 80,
  });
  // Fake inacessível: produção / sem segredo → 404
  const prodFake = await handlePaymentWebhook({
    providerName: "fake",
    headers: {},
    rawBody: "{}",
    db,
    paymentIntentsIsPostgres: true,
    env: testFakeEnv({
      NODE_ENV: "production",
      NEXT_PUBLIC_DEMO_MODE: "false",
      CORTELY_ENABLE_FAKE_PAYMENT_PROVIDER: "true",
    }),
  });
  assert.equal(prodFake.httpStatus, 404);
  assert.deepEqual(prodFake.body, { ok: false, error: "provider unknown" });
  ok("produção + fake → 404");

  const noSecret = await handlePaymentWebhook({
    providerName: "fake",
    headers: {},
    rawBody: "{}",
    db,
    paymentIntentsIsPostgres: true,
    env: testFakeEnv({ CORTELY_FAKE_PAYMENT_SECRET: "" }),
  });
  assert.equal(noSecret.httpStatus, 404);
  assert.equal(resolveProvider("fake", testFakeEnv({ CORTELY_FAKE_PAYMENT_SECRET: "" })), null);
  ok("sem CORTELY_FAKE_PAYMENT_SECRET → 404");

  assert.throws(
    () =>
      assertFakePaymentProviderSafeAtBoot({
        NODE_ENV: "production",
        NEXT_PUBLIC_DEMO_MODE: "false",
        CORTELY_ENABLE_FAKE_PAYMENT_PROVIDER: "true",
      } as NodeJS.ProcessEnv),
    (e: unknown) => e instanceof FakePaymentBootError,
  );
  ok("boot produção + flag fake → fail-fast");

  const bad = await handlePaymentWebhook({
    providerName: "fake",
    headers: { "x-cortely-fake-signature": "deadbeef" },
    rawBody: badBody,
    db,
    paymentIntentsIsPostgres: true,
    env: testFakeEnv(),
  });
  assert.equal(bad.httpStatus, 401);
  assert.deepEqual(bad.body, { ok: false, error: "invalid signature" });
  const afterBad = await counts(pool);
  assert.deepEqual(afterBad, beforeBad);
  ok("assinatura inválida → 401 e zero escrita");

  // Intent inexistente → quarentena; 3x → attempts=3
  const missBody = (n: number) =>
    JSON.stringify({
      provider_event_id: "evt-miss-ts",
      provider_ref: "ref-does-not-exist",
      status: "paid",
      amount: 10,
      n,
    });
  for (let i = 0; i < 3; i++) {
    const raw = missBody(i);
    const sig = fakeSign(raw, SECRET);
    const r = await handlePaymentWebhook({
      providerName: "fake",
      headers: { "x-cortely-fake-signature": sig },
      rawBody: raw,
      db,
      paymentIntentsIsPostgres: true,
      env: testFakeEnv(),
    });
    assert.equal(r.httpStatus, 202);
    assert.deepEqual(r.body, { ok: true });
  }
  const miss = await pool.query(
    `SELECT attempts, count(*) OVER() AS rows
     FROM public.payment_webhook_quarantine
     WHERE provider_event_id = 'evt-miss-ts'`,
  );
  assert.equal(Number(miss.rows[0].attempts), 3);
  assert.equal(Number(miss.rows[0].rows), 1);
  ok("intent inexistente → quarentena; 3x → 1 linha attempts=3");

  // Evento duplicado + paralelo
  const evtDup = `evt-dup-${randomUUID().slice(0, 8)}`;
  const dupBody = JSON.stringify({
    provider_event_id: evtDup,
    provider_ref: ref,
    status: "paid",
    amount: 80,
  });
  const dupSig = fakeSign(dupBody, SECRET);
  const parallel = await Promise.all([
    handlePaymentWebhook({
      providerName: "fake",
      headers: { "x-cortely-fake-signature": dupSig },
      rawBody: dupBody,
      db,
      paymentIntentsIsPostgres: true,
      env: testFakeEnv(),
    }),
    handlePaymentWebhook({
      providerName: "fake",
      headers: { "x-cortely-fake-signature": dupSig },
      rawBody: dupBody,
      db,
      paymentIntentsIsPostgres: true,
      env: testFakeEnv(),
    }),
  ]);
  assert.ok(parallel.every((p) => p.httpStatus === 200 && p.body.ok === true));
  const evCount = await pool.query(
    `SELECT count(*)::int AS n FROM public.payment_webhook_events
     WHERE provider_event_id = $1`,
    [evtDup],
  );
  assert.equal(Number(evCount.rows[0].n), 1);
  const third = await handlePaymentWebhook({
    providerName: "fake",
    headers: { "x-cortely-fake-signature": dupSig },
    rawBody: dupBody,
    db,
    paymentIntentsIsPostgres: true,
    env: testFakeEnv(),
  });
  assert.deepEqual(third.body, { ok: true });
  // paid_at preenchido, applied_at NULL
  const paidCols = await pool.query(
    `SELECT status, paid_at, applied_at FROM public.payment_intents WHERE provider_ref = $1`,
    [ref],
  );
  assert.equal(paidCols.rows[0].status, "paid");
  assert.ok(paidCols.rows[0].paid_at);
  assert.equal(paidCols.rows[0].applied_at, null);
  ok("duplicado / paralelo → um event; paid_at set, applied_at NULL");

  // Payload alegando outro barbershop → tenant da intent
  const ref2 = `ref-tenant-${randomUUID().slice(0, 8)}`;
  await pool.query(
    `INSERT INTO public.payment_intents (
       barbershop_id, provider, provider_ref, amount, method, status, purpose
     ) VALUES ($1,'fake',$2,25,'pix','pending','sale')`,
    [shop, ref2],
  );
  const tenantBody = JSON.stringify({
    provider_event_id: `evt-tenant-${randomUUID().slice(0, 8)}`,
    provider_ref: ref2,
    status: "paid",
    amount: 25,
    barbershop_id: SHOP_B,
  });
  const tenantRes = await handlePaymentWebhook({
    providerName: "fake",
    headers: { "x-cortely-fake-signature": fakeSign(tenantBody, SECRET) },
    rawBody: tenantBody,
    db,
    paymentIntentsIsPostgres: true,
    env: testFakeEnv(),
  });
  assert.equal(tenantRes.httpStatus, 200);
  assert.deepEqual(tenantRes.body, { ok: true });
  const tenantRow = await pool.query(
    `SELECT barbershop_id, status FROM public.payment_intents WHERE provider_ref = $1`,
    [ref2],
  );
  assert.equal(tenantRow.rows[0].barbershop_id, shop);
  assert.equal(tenantRow.rows[0].status, "paid");
  ok("payload com outro barbershop → tenant da intent prevalece (resposta mínima)");

  // amount_mismatch
  const ref3 = `ref-amt-${randomUUID().slice(0, 8)}`;
  await pool.query(
    `INSERT INTO public.payment_intents (
       barbershop_id, provider, provider_ref, amount, method, status, purpose
     ) VALUES ($1,'fake',$2,40,'pix','pending','sale')`,
    [shop, ref3],
  );
  const amtBody = JSON.stringify({
    provider_event_id: `evt-amt-${randomUUID().slice(0, 8)}`,
    provider_ref: ref3,
    status: "paid",
    amount: 41,
  });
  const amtRes = await handlePaymentWebhook({
    providerName: "fake",
    headers: { "x-cortely-fake-signature": fakeSign(amtBody, SECRET) },
    rawBody: amtBody,
    db,
    paymentIntentsIsPostgres: true,
    env: testFakeEnv(),
  });
  assert.equal(amtRes.httpStatus, 202);
  assert.deepEqual(amtRes.body, { ok: true });
  const st = await pool.query(
    `SELECT status FROM public.payment_intents WHERE provider_ref = $1`,
    [ref3],
  );
  assert.equal(st.rows[0].status, "pending");
  const amtQ = await pool.query(
    `SELECT error_reason FROM public.payment_webhook_quarantine
     WHERE error_reason = 'amount_mismatch' ORDER BY created_at DESC LIMIT 1`,
  );
  assert.equal(amtQ.rows[0].error_reason, "amount_mismatch");
  ok("amount_mismatch → quarentena; intent inalterada");

  // Fora de ordem: paid depois pending
  const ref4 = `ref-oo-${randomUUID().slice(0, 8)}`;
  await pool.query(
    `INSERT INTO public.payment_intents (
       barbershop_id, provider, provider_ref, amount, method, status, purpose
     ) VALUES ($1,'fake',$2,15,'pix','pending','other')`,
    [shop, ref4],
  );
  const paidBody = JSON.stringify({
    provider_event_id: `evt-oo-paid-${randomUUID().slice(0, 8)}`,
    provider_ref: ref4,
    status: "paid",
    amount: 15,
  });
  await handlePaymentWebhook({
    providerName: "fake",
    headers: { "x-cortely-fake-signature": fakeSign(paidBody, SECRET) },
    rawBody: paidBody,
    db,
    paymentIntentsIsPostgres: true,
    env: testFakeEnv(),
  });
  const pendBody = JSON.stringify({
    provider_event_id: `evt-oo-pend-${randomUUID().slice(0, 8)}`,
    provider_ref: ref4,
    status: "pending",
    amount: 15,
  });
  await handlePaymentWebhook({
    providerName: "fake",
    headers: { "x-cortely-fake-signature": fakeSign(pendBody, SECRET) },
    rawBody: pendBody,
    db,
    paymentIntentsIsPostgres: true,
    env: testFakeEnv(),
  });
  const oo = await pool.query(
    `SELECT status, paid_at, applied_at FROM public.payment_intents WHERE provider_ref = $1`,
    [ref4],
  );
  assert.equal(oo.rows[0].status, "paid");
  assert.ok(oo.rows[0].paid_at);
  assert.equal(oo.rows[0].applied_at, null);
  ok("fora de ordem: paid depois pending → continua paid; applied_at NULL");

  // Reprocessar quarentena após intent existir
  const ref5 = `ref-rep-${randomUUID().slice(0, 8)}`;
  const evtRep = `evt-rep-${randomUUID().slice(0, 8)}`;
  const repPayload = {
    provider_event_id: evtRep,
    provider_ref: ref5,
    status: "paid",
    amount: 33,
  };
  const qIns = await pool.query(
    `SELECT quarantine_id FROM public.ops_quarantine_payment_webhook(
       'fake', $1, $2::jsonb, 'intent_missing', true
     )`,
    [evtRep, JSON.stringify(repPayload)],
  );
  const qid = String(qIns.rows[0].quarantine_id);
  await pool.query(
    `INSERT INTO public.payment_intents (
       barbershop_id, provider, provider_ref, amount, method, status, purpose
     ) VALUES ($1,'fake',$2,33,'pix','pending','appointment')`,
    [shop, ref5],
  );
  const rep1 = await reprocessQuarantine(db, qid);
  assert.ok(rep1);
  assert.equal(String(rep1.result), "processed");
  const rep2 = await reprocessQuarantine(db, qid);
  assert.equal(String(rep2!.result), "already_processed");
  ok("reprocessar quarentena → processed; 2ª vez idempotente");

  // payment_intents=json → 503 zero escrita
  const before503 = await counts(pool);
  const body503 = JSON.stringify({
    provider_event_id: "evt-503",
    provider_ref: ref,
    status: "paid",
    amount: 80,
  });
  const r503 = await handlePaymentWebhook({
    providerName: "fake",
    headers: { "x-cortely-fake-signature": fakeSign(body503, SECRET) },
    rawBody: body503,
    db,
    paymentIntentsIsPostgres: false,
    env: testFakeEnv(),
  });
  assert.equal(r503.httpStatus, 503);
  assert.equal(r503.body.ok, false);
  assert.deepEqual(await counts(pool), before503);
  ok("payment_intents=json → 503, zero escrita");

  // Registry seed: payment_intents is json
  clearRegistryBootCache();
  const allJson = loadRegistry({
    tableExists: false,
    fileContents: bundledRegistrySeedText(),
  });
  assert.equal(allJson.map.payment_intents.source, "json");

  // Isolated postgres only for payment_intents
  const mixed: Record<string, DomainRegistryEntry> = {};
  for (const d of OPS_DOMAINS) {
    mixed[d] = { ...allJson.map[d] };
  }
  mixed.payment_intents = {
    source: "postgres",
    state: "active_postgres",
    cutover_at: "2026-11-12T00:00:00.000Z",
  };
  const rows = OPS_DOMAINS.map((d) => ({
    domain: d,
    source: mixed[d].source,
    state: mixed[d].state,
    cutover_at: mixed[d].cutover_at ?? null,
  }));
  const iso = loadRegistry({ tableExists: true, tableRows: rows });
  assert.equal(iso.map.payment_intents.source, "postgres");
  assert.equal(iso.map.cash.source, "json");
  ok("registry: payment_intents=postgres isolado com ops_core=json");

  // Produção sem demo + provedor falhando → 503, sem QR simulado
  const prevDemo = process.env.NEXT_PUBLIC_DEMO_MODE;
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const prevMp = process.env.MERCADOPAGO_ACCESS_TOKEN;
  const prevAsaas = process.env.ASAAS_API_KEY;
  try {
    process.env.NEXT_PUBLIC_DEMO_MODE = "false";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "eyJhbGciOiJtest";
    delete process.env.MERCADOPAGO_ACCESS_TOKEN;
    delete process.env.ASAAS_API_KEY;
    await assert.rejects(
      () =>
        createPaymentIntent({
          amount: 10,
          description: "test prod",
        }),
      (e: unknown) =>
        e instanceof PaymentProviderUnavailableError && e.status === 503,
    );
    ok("prod sem demo + sem provedor → 503, nenhum QR simulado");

    // Demo ainda simula
    process.env.NEXT_PUBLIC_DEMO_MODE = "true";
    const sim = await createPaymentIntent({
      amount: 10,
      description: "test demo",
    });
    assert.equal(sim.status, "simulated");
    assert.ok(sim.qr_code);
    ok("demo mode → Pix simulado permitido");
  } finally {
    if (prevDemo === undefined) delete process.env.NEXT_PUBLIC_DEMO_MODE;
    else process.env.NEXT_PUBLIC_DEMO_MODE = prevDemo;
    if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
    if (prevKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevKey;
    if (prevMp === undefined) delete process.env.MERCADOPAGO_ACCESS_TOKEN;
    else process.env.MERCADOPAGO_ACCESS_TOKEN = prevMp;
    if (prevAsaas === undefined) delete process.env.ASAAS_API_KEY;
    else process.env.ASAAS_API_KEY = prevAsaas;
  }

  // FakeProvider verify timing-safe path
  assert.equal(fake.verifyWebhook({ "x-cortely-fake-signature": "x" }, "{}"), false);
  const okBody = '{"a":1}';
  assert.equal(
    fake.verifyWebhook(
      { "x-cortely-fake-signature": fakeSign(okBody, SECRET) },
      okBody,
    ),
    true,
  );
  ok("FakeProvider HMAC + timingSafeEqual");

  await pool.end();

  writeFileSync(
    EVIDENCE,
    evidence.join("\n") + `\nPASSED=true asserts=${passed}\n`,
    "utf8",
  );
  if (existsSync("/opt/cursor")) {
    mkdirSync("/opt/cursor/artifacts", { recursive: true });
    writeFileSync(
      "/opt/cursor/artifacts/cortely-fase1b3g-gateway-evidence.txt",
      readFileSync(EVIDENCE),
    );
  }
  note(`Security fase 1.B.3-G gateway: PASSED (${passed} asserts)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
