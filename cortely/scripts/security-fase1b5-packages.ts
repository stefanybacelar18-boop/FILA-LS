/**
 * 1.B.5 — migration packages + contrato JSON↔PG + concorrência consume + isolamento.
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import pg from "pg";
import {
  createJsonPackagesRepository,
  createPgPackagesRepository,
  PackagesError,
} from "../src/lib/packages-repository";
import { opsStore } from "../src/lib/ops-store";
import {
  bundledRegistrySeedText,
  loadRegistry,
  OPS_DOMAINS,
} from "../src/lib/ops-registry";
import { createOpsRepository } from "../src/lib/ops-repository";

const ROOT = resolve(__dirname, "..");
const SQL_DIR = join(ROOT, "scripts/sql");
const MIG_DIR = join(ROOT, "supabase/migrations");
const EVIDENCE = "/tmp/cortely-fase1b5-packages-evidence.txt";
const DB = process.env.CORTELY_FASE1B5_TEST_DB || "cortely_fase1b5_packages_test";

const useTcp = Boolean(process.env.PGHOST) || Boolean(process.env.PGPASSWORD);

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

  note("=== Cortely fase1b5 packages ===");
  ensurePostgres();
  ensurePostgresTcpPassword();

  const harness = join(SQL_DIR, "fase1b5_packages_harness.sql");
  const mig = join(MIG_DIR, "20261112_fase1b_05_packages.sql");
  const tests = join(SQL_DIR, "fase1b5_packages_tests.sql");
  for (const f of [harness, mig, tests]) {
    if (!existsSync(f)) {
      console.error("missing", f);
      process.exit(1);
    }
  }

  recreateDb(DB);
  note("Applying harness…");
  psqlFileAll(DB, harness);
  note("Applying migration 20261112_fase1b_05…");
  psqlFileAll(DB, mig);
  note("Running SQL asserts…");
  const sqlOut = psqlFileAll(DB, tests);
  note(sqlOut.slice(-2500));
  if (!sqlOut.includes("FASE1B5_PACKAGES_SQL_PASSED")) {
    console.error("missing FASE1B5_PACKAGES_SQL_PASSED");
    process.exit(1);
  }
  ok("SQL asserts sell/consume/revert/cancel/grants/isolamento");

  const pool = new pg.Pool(pgConfig());
  const db = {
    query: async <T extends Record<string, unknown>>(
      text: string,
      params?: unknown[],
    ) => {
      const res = await pool.query(text, params);
      return { rows: res.rows as T[], rowCount: res.rowCount };
    },
  };

  const shop = randomUUID();
  const client = randomUUID();
  await pool.query(
    `INSERT INTO public.barbershops (id, name, slug) VALUES ($1,'Pkg','pkg')`,
    [shop],
  );
  await pool.query(
    `INSERT INTO public.clients (id, barbershop_id, full_name, phone) VALUES ($1,$2,'C','999')`,
    [client, shop],
  );

  const pgRepo = createPgPackagesRepository(db, shop);
  const jsonRepo = createJsonPackagesRepository(opsStore, shop);

  const jPkg = await jsonRepo.upsertPackage({
    name: "JSON Pack",
    price: 100,
    credits: 2,
    valid_days: 30,
  });
  const pPkg = await pgRepo.upsertPackage({
    name: "PG Pack",
    price: 100,
    credits: 2,
    valid_days: 30,
  });
  assert.equal(jPkg.credits, pPkg.credits);
  assert.equal((await jsonRepo.listPackages()).length >= 1, true);
  assert.equal((await pgRepo.listPackages()).length >= 1, true);
  ok("contrato JSON×PG: criar/listar pacote");

  // PG sell com venda paga
  const saleId = randomUUID();
  await pool.query(
    `INSERT INTO public.sales (id, barbershop_id, client_id, total, status)
     VALUES ($1,$2,$3,100,'paid')`,
    [saleId, shop, client],
  );
  await pool.query(
    `INSERT INTO public.sale_items (
       sale_id, barbershop_id, kind, ref_id, description, quantity, unit_price, total
     ) VALUES ($1,$2,'package',$3,'PG Pack',1,100,100)`,
    [saleId, shop, pPkg.id],
  );
  const sold = await pgRepo.sellPackage({
    client_id: client,
    package_id: pPkg.id,
    created_by: "t",
    sale_id: saleId,
  });
  assert.equal(sold.credits_total, 2);
  assert.equal(sold.credits_left, 2);
  assert.equal(sold.status, "active");

  const sold2 = await pgRepo.sellPackage({
    client_id: client,
    package_id: pPkg.id,
    created_by: "t",
    sale_id: saleId,
  });
  assert.equal(sold2.id, sold.id);
  ok("PG: vender (venda paga) + idempotente");

  // Consumir até esgotar
  const appt1 = randomUUID();
  const appt2 = randomUUID();
  await pool.query(
    `INSERT INTO public.appointments (id, barbershop_id, client_name) VALUES ($1,$2,'1'),($3,$2,'2')`,
    [appt1, shop, appt2],
  );
  const c1 = await pgRepo.consumeCredit({
    client_package_id: sold.id,
    appointment_id: appt1,
    actor: "t",
  });
  assert.equal(c1.client_package.credits_left, 1);
  const c2 = await pgRepo.consumeCredit({
    client_package_id: sold.id,
    appointment_id: appt2,
    actor: "t",
  });
  assert.equal(c2.client_package.credits_left, 0);
  assert.equal(c2.client_package.status, "depleted");
  ok("PG: consumir até esgotar");

  // Dois consumos simultâneos com 1 crédito → só um passa
  const shopRace = randomUUID();
  const clientRace = randomUUID();
  const pkgRace = randomUUID();
  const saleRace = randomUUID();
  const apptR1 = randomUUID();
  const apptR2 = randomUUID();
  await pool.query(
    `INSERT INTO public.barbershops (id, name, slug) VALUES ($1,'Race','race-pkg')`,
    [shopRace],
  );
  await pool.query(
    `INSERT INTO public.clients (id, barbershop_id, full_name, phone) VALUES ($1,$2,'R','1')`,
    [clientRace, shopRace],
  );
  await pool.query(
    `INSERT INTO public.service_packages (id, barbershop_id, name, price, credits, valid_days)
     VALUES ($1,$2,'R',50,1,30)`,
    [pkgRace, shopRace],
  );
  await pool.query(
    `INSERT INTO public.sales (id, barbershop_id, total, status) VALUES ($1,$2,50,'paid')`,
    [saleRace, shopRace],
  );
  await pool.query(
    `INSERT INTO public.sale_items (
       sale_id, barbershop_id, kind, ref_id, description, quantity, unit_price, total
     ) VALUES ($1,$2,'package',$3,'R',1,50,50)`,
    [saleRace, shopRace, pkgRace],
  );
  await pool.query(
    `INSERT INTO public.appointments (id, barbershop_id) VALUES ($1,$3),($2,$3)`,
    [apptR1, apptR2, shopRace],
  );
  const raceSell = await pool.query(
    `SELECT * FROM public.ops_sell_package($1,$2,$3,$4,'r')`,
    [shopRace, clientRace, pkgRace, saleRace],
  );
  const cpRace = String(raceSell.rows[0].client_package_id);
  const raceResults = await Promise.allSettled([
    pool.query(`SELECT * FROM public.ops_consume_package_credit($1,$2,$3,'a')`, [
      shopRace,
      cpRace,
      apptR1,
    ]),
    pool.query(`SELECT * FROM public.ops_consume_package_credit($1,$2,$3,'b')`, [
      shopRace,
      cpRace,
      apptR2,
    ]),
  ]);
  const okConsumes = raceResults.filter((r) => r.status === "fulfilled").length;
  const failConsumes = raceResults.filter((r) => r.status === "rejected").length;
  assert.equal(okConsumes, 1);
  assert.equal(failConsumes, 1);
  const used = await pool.query(
    `SELECT credits_used, status FROM public.client_packages WHERE id = $1`,
    [cpRace],
  );
  assert.equal(Number(used.rows[0].credits_used), 1);
  assert.equal(String(used.rows[0].status), "depleted");
  ok("dois consumos simultâneos com 1 crédito → só um passa");

  // Expirado via adapter
  const pkgExp = await pgRepo.upsertPackage({
    name: "Exp",
    price: 10,
    credits: 1,
    valid_days: 1,
  });
  const saleExp = randomUUID();
  await pool.query(
    `INSERT INTO public.sales (id, barbershop_id, total, status) VALUES ($1,$2,10,'paid')`,
    [saleExp, shop],
  );
  await pool.query(
    `INSERT INTO public.sale_items (
       sale_id, barbershop_id, kind, ref_id, description, quantity, unit_price, total
     ) VALUES ($1,$2,'package',$3,'E',1,10,10)`,
    [saleExp, shop, pkgExp.id],
  );
  const soldExp = await pgRepo.sellPackage({
    client_id: client,
    package_id: pkgExp.id,
    created_by: "t",
    sale_id: saleExp,
  });
  await pool.query(
    `UPDATE public.client_packages SET expires_at = now() - interval '1 day' WHERE id = $1`,
    [soldExp.id],
  );
  await assert.rejects(
    () =>
      pgRepo.consumeCredit({
        client_package_id: soldExp.id,
        actor: "t",
      }),
    (e: unknown) => e instanceof PackagesError && e.status === 409,
  );
  const expRow = await pool.query(
    `SELECT status FROM public.client_packages WHERE id = $1`,
    [soldExp.id],
  );
  assert.equal(String(expRow.rows[0].status), "expired");
  ok("expirado não consome e fica expired");

  // Sell concorrente mesma sale_id → idempotente (unique_violation → existing)
  const shopSell = randomUUID();
  const clientSell = randomUUID();
  const pkgSell = randomUUID();
  const saleSell = randomUUID();
  await pool.query(
    `INSERT INTO public.barbershops (id, name, slug) VALUES ($1,'SellRace','sell-race')`,
    [shopSell],
  );
  await pool.query(
    `INSERT INTO public.clients (id, barbershop_id, full_name, phone) VALUES ($1,$2,'S','2')`,
    [clientSell, shopSell],
  );
  await pool.query(
    `INSERT INTO public.service_packages (id, barbershop_id, name, price, credits, valid_days)
     VALUES ($1,$2,'S',60,2,30)`,
    [pkgSell, shopSell],
  );
  await pool.query(
    `INSERT INTO public.sales (id, barbershop_id, client_id, total, status)
     VALUES ($1,$2,$3,60,'paid')`,
    [saleSell, shopSell, clientSell],
  );
  await pool.query(
    `INSERT INTO public.sale_items (
       sale_id, barbershop_id, kind, ref_id, description, quantity, unit_price, total
     ) VALUES ($1,$2,'package',$3,'S',1,60,60)`,
    [saleSell, shopSell, pkgSell],
  );
  const sellRace = await Promise.allSettled([
    pool.query(`SELECT * FROM public.ops_sell_package($1,$2,$3,$4,'a')`, [
      shopSell,
      clientSell,
      pkgSell,
      saleSell,
    ]),
    pool.query(`SELECT * FROM public.ops_sell_package($1,$2,$3,$4,'b')`, [
      shopSell,
      clientSell,
      pkgSell,
      saleSell,
    ]),
  ]);
  assert.equal(
    sellRace.filter((r) => r.status === "fulfilled").length,
    2,
    `sell paralelo falhou: ${sellRace.map((r) => (r.status === "rejected" ? String(r.reason) : "ok")).join(" | ")}`,
  );
  const sellIds = sellRace
    .filter((r): r is PromiseFulfilledResult<pg.QueryResult> => r.status === "fulfilled")
    .map((r) => String(r.value.rows[0].client_package_id));
  assert.equal(sellIds[0], sellIds[1]);
  const sellCount = await pool.query(
    `SELECT count(*)::int AS n FROM public.client_packages WHERE barbershop_id = $1 AND sale_id = $2`,
    [shopSell, saleSell],
  );
  assert.equal(Number(sellCount.rows[0].n), 1);
  ok("sell concorrente mesma sale_id → um client_package");

  // OpsRepository
  const allJson = loadRegistry({
    tableExists: false,
    fileContents: bundledRegistrySeedText(),
  });
  assert.equal(
    createOpsRepository({
      registry: allJson,
      sessionBarbershopId: shop,
      pg: db,
    }).source("packages"),
    "json",
  );
  const cutoverAt = "2026-11-12T00:00:00.000Z";
  const allPg = loadRegistry({
    tableExists: true,
    tableRows: OPS_DOMAINS.map((d) => ({
      domain: d,
      source: "postgres" as const,
      state: "active_postgres" as const,
      cutover_at: cutoverAt,
    })),
  });
  const repoPg = createOpsRepository({
    registry: allPg,
    sessionBarbershopId: shop,
    pg: db,
  });
  assert.equal(repoPg.source("packages"), "postgres");
  assert.ok((await repoPg.packages().listPackages()).length >= 1);
  ok("OpsRepository entrega PG só com packages=postgres");

  await pool.end();
  note(`PASSED ${passed}`);
  try {
    mkdirSync("/tmp", { recursive: true });
    writeFileSync(EVIDENCE, evidence.join("\n") + "\n");
  } catch {
    /* ignore */
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
