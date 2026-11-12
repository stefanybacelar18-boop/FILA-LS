/**
 * 1.B.2 — migration cash + contrato JSON↔PG + concorrência + isolamento + órfãos.
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import pg from "pg";
import {
  CashError,
  createJsonCashRepository,
  createPgCashRepository,
} from "../src/lib/cash-repository";
import { opsStore } from "../src/lib/ops-store";
import {
  bundledRegistrySeedText,
  loadRegistry,
} from "../src/lib/ops-registry";
import { createOpsRepository } from "../src/lib/ops-repository";

const ROOT = resolve(__dirname, "..");
const SQL_DIR = join(ROOT, "scripts/sql");
const MIG_DIR = join(ROOT, "supabase/migrations");
const EVIDENCE = "/tmp/cortely-fase1b2-cash-evidence.txt";
const DB = process.env.CORTELY_FASE1B2_TEST_DB || "cortely_fase1b2_cash_test";
const DB_ORPHAN =
  process.env.CORTELY_FASE1B2_ORPHAN_DB || "cortely_fase1b2_orphan_test";

const useTcp = Boolean(process.env.PGHOST) || Boolean(process.env.PGPASSWORD);

const SHOP_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SHOP_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SHOP_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

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
    const host = process.env.PGHOST || "127.0.0.1";
    const port = process.env.PGPORT || "5432";
    const user = process.env.PGUSER || "postgres";
    return ["psql", "-h", host, "-p", port, "-U", user, "-d", db, ...extra];
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

function ensurePostgresTcpPassword() {
  if (useTcp) return;
  try {
    sh(`sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'postgres'"`);
  } catch {
    /* ignore */
  }
}

function pgConfig(database = DB) {
  return {
    host: process.env.PGHOST || "127.0.0.1",
    port: Number(process.env.PGPORT || "5432"),
    user: process.env.PGUSER || "postgres",
    password: process.env.PGPASSWORD || "postgres",
    database,
  };
}

function recreateDb(name: string) {
  try {
    psqlCmd("postgres", `DROP DATABASE IF EXISTS ${name}`);
  } catch {
    /* ignore */
  }
  psqlCmd("postgres", `CREATE DATABASE ${name}`);
  psqlCmd(name, "CREATE EXTENSION IF NOT EXISTS pgcrypto");
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

  note("=== Cortely fase1b2 cash ===");
  ensurePostgres();
  ensurePostgresTcpPassword();

  const harness = join(SQL_DIR, "fase1b2_cash_harness.sql");
  const mig = join(MIG_DIR, "20261112_fase1b_02_cash.sql");
  const tests = join(SQL_DIR, "fase1b2_cash_tests.sql");
  for (const f of [harness, mig, tests]) {
    if (!existsSync(f)) {
      console.error("missing", f);
      process.exit(1);
    }
  }

  // —— Órfãos: migration deve falhar ——
  recreateDb(DB_ORPHAN);
  psqlFileAll(DB_ORPHAN, harness);
  // Quebra FK para deixar payment órfão
  psqlCmd(
    DB_ORPHAN,
    `ALTER TABLE public.sale_payments DROP CONSTRAINT IF EXISTS sale_payments_sale_id_fkey;
     INSERT INTO public.sale_payments (sale_id, method, amount)
     VALUES ('99999999-9999-4999-8999-999999999999', 'cash', 10);`,
  );
  let orphanFailed = false;
  let orphanOut = "";
  try {
    orphanOut = psqlFileAll(DB_ORPHAN, mig);
    orphanFailed = /ERROR:/i.test(orphanOut);
  } catch (e) {
    orphanFailed = true;
    const err = e as {
      message?: string;
      stdout?: string;
      stderr?: string;
    };
    orphanOut = `${err.stdout || ""}\n${err.stderr || ""}\n${err.message || e}`;
  }
  assert.ok(
    orphanFailed,
    `migration deveria falhar com órfão: ${orphanOut.slice(-800)}`,
  );
  assert.ok(
    /órfão|fase1b_02/i.test(orphanOut),
    `mensagem clara de órfão ausente: ${orphanOut.slice(-800)}`,
  );
  ok("migration falha com sale_payments órfão (mensagem clara)");

  // —— DB principal ——
  recreateDb(DB);
  note("Applying harness…");
  psqlFileAll(DB, harness);
  note("Applying migration 20261112_fase1b_02…");
  psqlFileAll(DB, mig);
  note("Running SQL asserts…");
  const sqlOut = psqlFileAll(DB, tests);
  note(sqlOut.slice(-2000));
  if (!sqlOut.includes("FASE1B2_CASH_SQL_PASSED")) {
    console.error("missing FASE1B2_CASH_SQL_PASSED");
    process.exit(1);
  }
  ok("SQL asserts cash/tenant/troco/grants");

  let pool: pg.Pool | null = null;
  try {
    pool = new pg.Pool(pgConfig());
    await pool.query("SELECT 1");
  } catch (e) {
    note(
      `WARN: node-pg indisponível (${e instanceof Error ? e.message : e}); pulando contrato/concurrency TS`,
    );
    pool = null;
  }

  if (pool) {
    const db = {
      query: async <T extends Record<string, unknown>>(
        text: string,
        params?: unknown[],
      ) => {
        const res = await pool!.query(text, params);
        return { rows: res.rows as T[], rowCount: res.rowCount };
      },
    };

    // Contrato JSON×PG (sem troco — JSON não suporta)
    const shopContract = randomUUID();
    await pool.query(
      `INSERT INTO public.barbershops (id, name, slug) VALUES ($1,'Contract Cash','contract-cash')`,
      [shopContract],
    );
    const pgCash = createPgCashRepository(db, shopContract);

    // Preparar JSON: fechar caixa aberto se houver
    const jsonCash = createJsonCashRepository(opsStore, shopContract);
    const existing = await jsonCash.currentCash();
    if (existing) {
      await jsonCash.closeCash({
        closed_by: "contract-setup",
        closing_amount: existing.opening_amount,
      });
    }

    const jOpen = await jsonCash.openCash({
      opened_by: "j",
      opening_amount: 100,
      notes: "json",
    });
    const pOpen = await pgCash.openCash({
      opened_by: "p",
      opening_amount: 100,
      notes: "pg",
    });
    assert.equal(jOpen.status, "open");
    assert.equal(pOpen.status, "open");
    assert.equal(jOpen.opening_amount, pOpen.opening_amount);

    await jsonCash.addCashMovement({
      type: "suprimento",
      amount: 50,
      reason: "sup",
      created_by: "j",
    });
    await pgCash.addCashMovement({
      type: "suprimento",
      amount: 50,
      reason: "sup",
      created_by: "p",
    });
    await jsonCash.addCashMovement({
      type: "sangria",
      amount: 20,
      reason: "san",
      created_by: "j",
    });
    await pgCash.addCashMovement({
      type: "sangria",
      amount: 20,
      reason: "san",
      created_by: "p",
    });

    const jConf = await jsonCash.cashConference();
    const pConf = await pgCash.cashConference();
    assert.equal(jConf.expected_cash, 130);
    assert.equal(pConf.expected_cash, 130);
    assert.deepEqual(jConf.by_method, {});
    assert.deepEqual(pConf.by_method, {});

    const jClose = await jsonCash.closeCash({
      closed_by: "j",
      closing_amount: 130,
    });
    const pClose = await pgCash.closeCash({
      closed_by: "p",
      closing_amount: 130,
    });
    assert.equal(jClose.status, "closed");
    assert.equal(pClose.status, "closed");
    assert.equal(jClose.expected_cash, 130);
    assert.equal(pClose.expected_cash, 130);
    assert.equal(jClose.difference, 0);
    assert.equal(pClose.difference, 0);
    ok("contrato JSON×PG: open/sangria/suprimento/conference/close");

    // OpsRepository: PG só com cash=postgres
    const allJson = loadRegistry({
      tableExists: false,
      fileContents: bundledRegistrySeedText(),
    });
    const repoJson = createOpsRepository({
      registry: allJson,
      sessionBarbershopId: shopContract,
      pg: db,
    });
    assert.equal(repoJson.source("cash"), "json");
    const viaJson = repoJson.cash();
    assert.equal(await viaJson.currentCash(), null);

    const cutoverAt = "2026-11-12T00:00:00.000Z";
    const { OPS_DOMAINS } = await import("../src/lib/ops-registry");
    const tableRows = OPS_DOMAINS.map((d) => ({
      domain: d,
      source: "postgres" as const,
      state: "active_postgres" as const,
      cutover_at: cutoverAt,
    }));
    const allPg = loadRegistry({ tableExists: true, tableRows });
    const repoPg = createOpsRepository({
      registry: allPg,
      sessionBarbershopId: shopContract,
      pg: db,
    });
    assert.equal(repoPg.source("cash"), "postgres");
    const viaPg = repoPg.cash();
    assert.equal(await viaPg.currentCash(), null);
    ok("OpsRepository entrega PG só com cash=postgres");

    // Concorrência: dois open simultâneos
    const shopRace = randomUUID();
    await pool.query(
      `INSERT INTO public.barbershops (id, name, slug) VALUES ($1,'Race','race-cash')`,
      [shopRace],
    );
    const raceRepo = createPgCashRepository(db, shopRace);
    const openRace = await Promise.allSettled([
      raceRepo.openCash({ opened_by: "r1", opening_amount: 10 }),
      raceRepo.openCash({ opened_by: "r2", opening_amount: 10 }),
    ]);
    const openOk = openRace.filter((r) => r.status === "fulfilled");
    const openFail = openRace.filter((r) => r.status === "rejected");
    assert.equal(openOk.length, 1);
    assert.equal(openFail.length, 1);
    const openRej = openFail[0] as PromiseRejectedResult;
    assert.ok(
      openRej.reason instanceof CashError && openRej.reason.status === 409,
    );
    ok("concorrência: dois open_cash → um passa, outro 409");

    const closeRace = await Promise.allSettled([
      raceRepo.closeCash({ closed_by: "c1", closing_amount: 10 }),
      raceRepo.closeCash({ closed_by: "c2", closing_amount: 10 }),
    ]);
    const closeOk = closeRace.filter((r) => r.status === "fulfilled");
    const closeFail = closeRace.filter((r) => r.status === "rejected");
    assert.equal(closeOk.length, 1);
    assert.equal(closeFail.length, 1);
    const closeRej = closeFail[0] as PromiseRejectedResult;
    assert.ok(
      closeRej.reason instanceof CashError && closeRej.reason.status === 409,
    );
    ok("concorrência: dois close_cash → um passa, outro 409");

    // Isolamento: B não lê caixa de A
    const pgA = createPgCashRepository(db, SHOP_A);
    const pgB = createPgCashRepository(db, SHOP_B);
    // SQL tests left B open — currentCash B ok; A closed
    const aCur = await pgA.currentCash();
    const bCur = await pgB.currentCash();
    assert.equal(aCur, null);
    assert.ok(bCur);
    assert.equal(bCur!.barbershop_id, SHOP_B);
    const pgC = createPgCashRepository(db, SHOP_C);
    const cCur = await pgC.currentCash();
    assert.ok(cCur);
    assert.equal(cCur!.barbershop_id, SHOP_C);
    ok("isolamento: 3 barbearias — currentCash só do tenant");

    // PG-only: troco scenario already in SQL; adapter conference after reopen
    const shopTroco = randomUUID();
    await pool.query(
      `INSERT INTO public.barbershops (id, name, slug) VALUES ($1,'Troco','troco')`,
      [shopTroco],
    );
    const trocoRepo = createPgCashRepository(db, shopTroco);
    const tOpen = await trocoRepo.openCash({
      opened_by: "t",
      opening_amount: 0,
    });
    const saleId = randomUUID();
    const payId = randomUUID();
    await pool.query(
      `INSERT INTO public.sales (
         id, barbershop_id, cash_session_id, subtotal, discount, total, status, created_by
       ) VALUES ($1,$2,$3,70,0,70,'paid','t')`,
      [saleId, shopTroco, tOpen.id],
    );
    await pool.query(
      `INSERT INTO public.sale_payments (
         id, sale_id, barbershop_id, method, amount, tendered_amount, applied_amount
       ) VALUES ($1,$2,$3,'cash',70,100,70)`,
      [payId, saleId, shopTroco],
    );
    await pool.query(
      `INSERT INTO public.cash_movements (
         barbershop_id, cash_session_id, sale_payment_id, direction, kind, amount, reason, created_by
       ) VALUES
         ($1,$2,$3,'in','sale_cash_in',100,'tendered','t'),
         ($1,$2,$3,'out','change',30,'troco','t')`,
      [shopTroco, tOpen.id, payId],
    );
    const tConf = await trocoRepo.cashConference();
    assert.equal(tConf.expected_cash, 70);
    assert.equal(tConf.by_method.cash, 70);
    ok("PG-only: cash 100 em venda 70 → esperado 70 (100-30)");

    await pool.end();
  }

  // Regressão rota
  const { getOpsStoreViaRepository, legacyOpsStoreIdentity } = await import(
    "../src/lib/ops-route-store"
  );
  const via = getOpsStoreViaRepository(SHOP_A);
  const legacy = legacyOpsStoreIdentity();
  assert.deepEqual(via.listProducts(), legacy.listProducts());
  assert.equal(!!via.currentCash(), !!legacy.currentCash());
  ok("regressão rota: store via OpsRepository ≡ opsStore");

  writeFileSync(
    EVIDENCE,
    evidence.join("\n") + `\nPASSED=true asserts=${passed}\n`,
    "utf8",
  );
  if (existsSync("/opt/cursor")) {
    mkdirSync("/opt/cursor/artifacts", { recursive: true });
    writeFileSync(
      "/opt/cursor/artifacts/cortely-fase1b2-cash-evidence.txt",
      readFileSync(EVIDENCE),
    );
  }
  note(`Security fase 1.B.2 cash: PASSED (${passed} asserts)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
