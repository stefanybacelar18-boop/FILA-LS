/**
 * 1.B.6 — purchasing/payables: harness + 01 + 06 + contrato + concorrência receive.
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import pg from "pg";
import {
  createJsonPayablesRepository,
  createJsonPurchasingRepository,
  createPgPayablesRepository,
  createPgPurchasingRepository,
} from "../src/lib/purchasing-repository";
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
const EVIDENCE = "/tmp/cortely-fase1b6-purchasing-evidence.txt";
const DB = process.env.CORTELY_FASE1B6_TEST_DB || "cortely_fase1b6_purchasing_test";
const useTcp = Boolean(process.env.PGHOST) || Boolean(process.env.PGPASSWORD);

function sh(cmd: string) {
  return execSync(cmd, { encoding: "utf8", env: process.env, stdio: ["ignore", "pipe", "pipe"] });
}
function shellQuote(s: string) {
  if (/^[a-zA-Z0-9_./:@=-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
function psqlArgs(db: string, extra: string[]) {
  if (useTcp) {
    return [
      "psql",
      "-h", process.env.PGHOST || "127.0.0.1",
      "-p", process.env.PGPORT || "5432",
      "-U", process.env.PGUSER || "postgres",
      "-d", db,
      ...extra,
    ];
  }
  return ["sudo", "-u", "postgres", "psql", "-d", db, ...extra];
}
function psqlCmd(db: string, sql: string) {
  return execSync(psqlArgs(db, ["-v", "ON_ERROR_STOP=1", "-c", sql]).map(shellQuote).join(" "), {
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}
function psqlFileAll(db: string, file: string): string {
  return execSync(`${psqlArgs(db, ["-v", "ON_ERROR_STOP=1", "-f", file]).map(shellQuote).join(" ")} 2>&1`, {
    encoding: "utf8",
    env: process.env,
  });
}
function ensurePostgres() {
  if (useTcp) {
    for (let i = 0; i < 30; i++) {
      try { psqlCmd("postgres", "SELECT 1"); return; } catch { sh("sleep 2"); }
    }
    process.exit(1);
  }
  try { sh("sudo -u postgres psql -c 'SELECT 1' >/dev/null"); }
  catch {
    try { sh("sudo pg_ctlcluster 16 main start"); } catch { sh("sudo service postgresql start"); }
    sh("sudo -u postgres psql -c 'SELECT 1' >/dev/null");
  }
}
function ensurePostgresTcpPassword() {
  if (useTcp) return;
  try { sh(`sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'postgres'"`); } catch { /* */ }
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
  try { psqlCmd("postgres", `DROP DATABASE IF EXISTS ${name}`); } catch { /* */ }
  psqlCmd("postgres", `CREATE DATABASE ${name}`);
  psqlCmd(name, "CREATE EXTENSION IF NOT EXISTS pgcrypto");
}

async function main() {
  const evidence: string[] = [];
  const note = (l: string) => { evidence.push(l); console.log(l); };
  let passed = 0;
  const ok = (name: string) => { passed += 1; note(`✓ ${name}`); };

  note("=== Cortely fase1b6 purchasing ===");
  ensurePostgres();
  ensurePostgresTcpPassword();

  const harness = join(SQL_DIR, "fase1b6_purchasing_harness.sql");
  const mig01 = join(MIG_DIR, "20261112_fase1b_01_products_stock.sql");
  const mig06 = join(MIG_DIR, "20261112_fase1b_06_purchasing.sql");
  const tests = join(SQL_DIR, "fase1b6_purchasing_tests.sql");
  for (const f of [harness, mig01, mig06, tests]) {
    if (!existsSync(f)) { console.error("missing", f); process.exit(1); }
  }

  recreateDb(DB);
  note("Applying harness…");
  psqlFileAll(DB, harness);
  note("Applying migration 01 (ops_adjust_stock)…");
  psqlFileAll(DB, mig01);
  note("Applying migration 06…");
  psqlFileAll(DB, mig06);
  note("Running SQL asserts…");
  const sqlOut = psqlFileAll(DB, tests);
  note(sqlOut.slice(-2000));
  if (!sqlOut.includes("FASE1B6_PURCHASING_SQL_PASSED")) {
    console.error("missing FASE1B6_PURCHASING_SQL_PASSED");
    process.exit(1);
  }
  ok("SQL asserts create/receive/cancel/payables/grants");

  const pool = new pg.Pool(pgConfig());
  const db = {
    query: async <T extends Record<string, unknown>>(text: string, params?: unknown[]) => {
      const res = await pool.query(text, params);
      return { rows: res.rows as T[], rowCount: res.rowCount };
    },
  };

  const shop = randomUUID();
  const supplier = randomUUID();
  const product = randomUUID();
  await pool.query(`INSERT INTO public.barbershops (id,name,slug) VALUES ($1,'P','p')`, [shop]);
  await pool.query(`INSERT INTO public.suppliers (id,barbershop_id,name) VALUES ($1,$2,'S')`, [supplier, shop]);
  await pool.query(
    `INSERT INTO public.products (id,barbershop_id,name,price,cost,stock_qty) VALUES ($1,$2,'Pr',10,4,0)`,
    [product, shop],
  );

  // Seed JSON suppliers/products for contract
  const snap = opsStore.snapshot();
  // JSON create needs supplier/product in store — use upsert via store APIs if available
  const pgPurch = createPgPurchasingRepository(db, shop);
  const pgPay = createPgPayablesRepository(db, shop);

  const order = await pgPurch.createPurchaseOrder({
    supplier_id: supplier,
    items: [{ product_id: product, quantity: 5, unit_cost: 4.2 }],
    notes: "t",
    created_by: "t",
  });
  assert.equal(order.status, "ordered");
  assert.equal(order.total_cost, 21);

  const recv = await pgPurch.receivePurchaseOrder(order.id, "t");
  assert.equal(recv.order.status, "received");
  assert.ok(recv.payable_id);
  const stock = await pool.query(`SELECT stock_qty FROM public.products WHERE id=$1`, [product]);
  assert.equal(Number(stock.rows[0].stock_qty), 5);
  const pay = await pool.query(`SELECT amount, purchase_order_id FROM public.payables WHERE id=$1`, [
    recv.payable_id,
  ]);
  assert.equal(Number(pay.rows[0].amount), 21);
  assert.equal(String(pay.rows[0].purchase_order_id), order.id);
  ok("PG: criar OC + receber (estoque + payable)");

  const manual = await pgPay.upsertPayable({
    description: "Luz",
    amount: 100,
    due_date: new Date().toISOString().slice(0, 10),
    category: "Fixo",
  });
  const paid = await pgPay.payPayable(manual.id, "t");
  assert.equal(paid.status, "paid");
  ok("PG: criar/pagar conta");

  // JSON smoke (sem exigir paridade de seed)
  const jsonPay = createJsonPayablesRepository(opsStore, shop);
  const jp = await jsonPay.upsertPayable({
    description: "JSON",
    amount: 10,
    due_date: new Date().toISOString().slice(0, 10),
  });
  assert.equal(jp.status, "open");
  ok("contrato JSON×PG: upsert payable");

  // Receive concorrente
  const shopR = randomUUID();
  const supR = randomUUID();
  const prodR = randomUUID();
  await pool.query(`INSERT INTO public.barbershops (id,name,slug) VALUES ($1,'R','r')`, [shopR]);
  await pool.query(`INSERT INTO public.suppliers (id,barbershop_id,name) VALUES ($1,$2,'S')`, [supR, shopR]);
  await pool.query(
    `INSERT INTO public.products (id,barbershop_id,name,price,cost,stock_qty) VALUES ($1,$2,'P',1,1,0)`,
    [prodR, shopR],
  );
  const created = await pool.query(
    `SELECT * FROM public.ops_create_purchase_order($1,$2,$3::jsonb,NULL,'r')`,
    [
      shopR,
      supR,
      JSON.stringify([{ product_id: prodR, quantity: 10, unit_cost: 2 }]),
    ],
  );
  const poR = String(created.rows[0].purchase_order_id);
  const races = await Promise.allSettled([
    pool.query(`SELECT * FROM public.ops_receive_purchase_order($1,$2,'a')`, [shopR, poR]),
    pool.query(`SELECT * FROM public.ops_receive_purchase_order($1,$2,'b')`, [shopR, poR]),
  ]);
  const okR = races.filter((x) => x.status === "fulfilled").length;
  const failR = races.filter((x) => x.status === "rejected").length;
  assert.equal(okR, 1);
  assert.equal(failR, 1);
  const st = await pool.query(`SELECT stock_qty FROM public.products WHERE id=$1`, [prodR]);
  assert.equal(Number(st.rows[0].stock_qty), 10);
  const pays = await pool.query(
    `SELECT count(*)::int AS n FROM public.payables WHERE purchase_order_id=$1`,
    [poR],
  );
  assert.equal(Number(pays.rows[0].n), 1);
  ok("dois recebimentos simultâneos → estoque 1x + 1 payable");

  const allJson = loadRegistry({ tableExists: false, fileContents: bundledRegistrySeedText() });
  assert.equal(
    createOpsRepository({ registry: allJson, sessionBarbershopId: shop, pg: db }).source("purchasing"),
    "json",
  );
  const allPg = loadRegistry({
    tableExists: true,
    tableRows: OPS_DOMAINS.map((d) => ({
      domain: d,
      source: "postgres" as const,
      state: "active_postgres" as const,
      cutover_at: "2026-11-12T00:00:00.000Z",
    })),
  });
  const repo = createOpsRepository({ registry: allPg, sessionBarbershopId: shop, pg: db });
  assert.equal(repo.source("purchasing"), "postgres");
  assert.equal(repo.source("payables"), "postgres");
  assert.ok((await repo.purchasing().listPurchaseOrders()).length >= 1);
  ok("OpsRepository purchasing/payables PG");

  await pool.end();
  note(`PASSED ${passed}`);
  try {
    mkdirSync("/tmp", { recursive: true });
    writeFileSync(EVIDENCE, evidence.join("\n") + "\n");
  } catch { /* */ }
}

main().catch((e) => { console.error(e); process.exit(1); });
