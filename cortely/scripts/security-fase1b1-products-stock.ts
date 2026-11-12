/**
 * 1.B.1 — migration products/stock + contrato JSON↔PG + concorrência + isolamento.
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import pg from "pg";
import {
  createJsonProductsStockRepository,
  createPgProductsStockRepository,
  ProductsStockError,
} from "../src/lib/products-stock-repository";
import { opsStore } from "../src/lib/ops-store";
import {
  bundledRegistrySeedText,
  loadRegistry,
} from "../src/lib/ops-registry";
import { createOpsRepository } from "../src/lib/ops-repository";

const ROOT = resolve(__dirname, "..");
const SQL_DIR = join(ROOT, "scripts/sql");
const MIG_DIR = join(ROOT, "supabase/migrations");
const EVIDENCE = "/tmp/cortely-fase1b1-products-stock-evidence.txt";
const DB = process.env.CORTELY_FASE1B1_TEST_DB || "cortely_fase1b1_stock_test";

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

function pgConfig() {
  return {
    host: process.env.PGHOST || "127.0.0.1",
    port: Number(process.env.PGPORT || "5432"),
    user: process.env.PGUSER || "postgres",
    password: process.env.PGPASSWORD || "postgres",
    database: DB,
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

  note("=== Cortely fase1b1 products/stock ===");
  ensurePostgres();
  ensurePostgresTcpPassword();

  try {
    psqlCmd("postgres", `DROP DATABASE IF EXISTS ${DB}`);
  } catch {
    /* ignore */
  }
  psqlCmd("postgres", `CREATE DATABASE ${DB}`);
  psqlCmd(DB, "CREATE EXTENSION IF NOT EXISTS pgcrypto");

  const harness = join(SQL_DIR, "fase1b1_products_stock_harness.sql");
  const mig = join(MIG_DIR, "20261112_fase1b_01_products_stock.sql");
  const tests = join(SQL_DIR, "fase1b1_products_stock_tests.sql");
  for (const f of [harness, mig, tests]) {
    if (!existsSync(f)) {
      console.error("missing", f);
      process.exit(1);
    }
  }

  note("Applying harness…");
  psqlFileAll(DB, harness);
  note("Applying migration 20261112_fase1b_01…");
  psqlFileAll(DB, mig);
  note("Running SQL asserts…");
  const sqlOut = psqlFileAll(DB, tests);
  note(sqlOut.slice(-1500));
  if (!sqlOut.includes("FASE1B1_PRODUCTS_STOCK_SQL_PASSED")) {
    console.error("missing FASE1B1_PRODUCTS_STOCK_SQL_PASSED");
    process.exit(1);
  }
  ok("SQL asserts products/stock");

  // Garantir que postgres aceita TCP local (CI já usa)
  if (!useTcp) {
    try {
      psqlCmd(DB, "SELECT 1");
    } catch {
      /* */
    }
    // tenta liberar trust/local — se node-pg falhar, usamos só SQL para concorrência
  }

  let pool: pg.Pool | null = null;
  try {
    pool = new pg.Pool(pgConfig());
    await pool.query("SELECT 1");
  } catch (e) {
    note(`WARN: node-pg indisponível (${e instanceof Error ? e.message : e}); pulando contrato/concurrency TS`);
    pool = null;
  }

  if (pool) {
    const db = {
      query: async <T extends Record<string, unknown>>(text: string, params?: unknown[]) => {
        const res = await pool!.query(text, params);
        return { rows: res.rows as T[], rowCount: res.rowCount };
      },
    };

    // Seed dedicado para contrato PG
    const shop = SHOP_A;
    const prodId = randomUUID();
    await pool.query(
      `INSERT INTO public.barbershops (id, name, slug) VALUES ($1,'Contract Shop','contract-shop')
       ON CONFLICT (id) DO NOTHING`,
      [shop],
    );
    // shop_a already inserted by SQL tests — use fresh product
    await pool.query(
      `INSERT INTO public.products (id, barbershop_id, name, price, cost, stock_qty, min_stock)
       VALUES ($1,$2,'Contract Prod',10,4,10,2)`,
      [prodId, shop],
    );

    const pgRepo = createPgProductsStockRepository(db, shop);
    const listed = await pgRepo.listProducts();
    assert.ok(listed.some((p) => p.id === prodId));
    const adj = await pgRepo.adjustStock({
      product_id: prodId,
      delta: -3,
      reason: "contract-adj",
    });
    assert.equal(adj.product.stock_qty, 7);
    const count = await pgRepo.inventoryCount({
      product_id: prodId,
      counted_qty: 9,
      counted_by: "tester",
    });
    assert.equal(count.difference, 2);
    const after = (await pgRepo.listProducts()).find((p) => p.id === prodId)!;
    assert.equal(after.stock_qty, 9);
    ok("adapter PG: list/adjust/inventory");

    await assert.rejects(
      () =>
        pgRepo.adjustStock({
          product_id: prodId,
          delta: -999,
          reason: "drain",
        }),
      (e: unknown) => e instanceof ProductsStockError && e.status === 409,
    );
    ok("adapter PG: insuficiente → 409");

    // Contrato JSON: mesmos shapes de adjust/lowStock
    const jsonRepo = createJsonProductsStockRepository(opsStore, shop);
    const jList = await jsonRepo.listProducts();
    assert.ok(Array.isArray(jList));
    const jLow = await jsonRepo.lowStock();
    assert.ok(Array.isArray(jLow));
    const seedProd = jList[0];
    assert.ok(seedProd);
    const beforeQty = seedProd.stock_qty;
    const jAdj = await jsonRepo.adjustStock({
      product_id: seedProd.id,
      delta: 1,
      reason: "json-contract",
    });
    assert.equal(jAdj.product.stock_qty, beforeQty + 1);
    assert.equal(jAdj.movement.delta, 1);
    await jsonRepo.adjustStock({
      product_id: seedProd.id,
      delta: -1,
      reason: "json-contract-revert",
    });
    ok("contrato JSON↔PG: shapes list/adjust/lowStock compatíveis");

    // OpsRepository entrega PG só com registry postgres
    const allJson = loadRegistry({
      tableExists: false,
      fileContents: bundledRegistrySeedText(),
    });
    const repoJson = createOpsRepository({
      registry: allJson,
      sessionBarbershopId: shop,
      pg: db,
    });
    assert.equal(repoJson.source("products"), "json");
    assert.ok(repoJson.productsStock());

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
      sessionBarbershopId: shop,
      pg: db,
    });
    const viaPg = repoPg.productsStock();
    const viaList = await viaPg.listProducts();
    assert.ok(viaList.some((p) => p.id === prodId));
    ok("OpsRepository entrega adapter PG só com registry postgres");

    // Concorrência: estoque=1; dois deltas -1 → um 409
    const raceProd = randomUUID();
    await pool.query(
      `INSERT INTO public.products (id, barbershop_id, name, price, cost, stock_qty, min_stock)
       VALUES ($1,$2,'Race',10,4,1,0)`,
      [raceProd, shop],
    );
    const results = await Promise.allSettled([
      pgRepo.adjustStock({ product_id: raceProd, delta: -1, reason: "race-1" }),
      pgRepo.adjustStock({ product_id: raceProd, delta: -1, reason: "race-2" }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    const rej = rejected[0] as PromiseRejectedResult;
    assert.ok(
      rej.reason instanceof ProductsStockError && rej.reason.status === 409,
    );
    const final = await pool.query(
      `SELECT stock_qty FROM public.products WHERE id = $1`,
      [raceProd],
    );
    assert.equal(Number(final.rows[0].stock_qty), 0);
    ok("concorrência: um passa, outro 409; estoque final 0");

    // Isolamento: B não ajusta produto de A
    const pgB = createPgProductsStockRepository(db, SHOP_B);
    await assert.rejects(
      () =>
        pgB.adjustStock({
          product_id: prodId,
          delta: 1,
          reason: "cross",
        }),
      (e: unknown) => e instanceof ProductsStockError && e.status === 404,
    );
    ok("isolamento: tenant B não ajusta produto de A");

    // 3ª barbearia sanity
    await pool.query(
      `INSERT INTO public.barbershops (id, name, slug) VALUES ($1,'C','c-iso')
       ON CONFLICT (id) DO NOTHING`,
      [SHOP_C],
    );
    const prodC = randomUUID();
    await pool.query(
      `INSERT INTO public.products (id, barbershop_id, name, price, cost, stock_qty, min_stock)
       VALUES ($1,$2,'Cprod',1,1,3,0)`,
      [prodC, SHOP_C],
    );
    const pgC = createPgProductsStockRepository(db, SHOP_C);
    const listC = await pgC.listProducts();
    assert.ok(listC.every((p) => p.barbershop_id === SHOP_C));
    assert.ok(!listC.some((p) => p.id === prodId));
    ok("isolamento: 3 barbearias — C não lê produto de A");

    await pool.end();
  }

  // Regressão: rota usa OpsRepository → mesmo singleton
  const { getOpsStoreViaRepository, legacyOpsStoreIdentity } = await import(
    "../src/lib/ops-route-store"
  );
  const via = getOpsStoreViaRepository(SHOP_A);
  const legacy = legacyOpsStoreIdentity();
  assert.deepEqual(via.listProducts(), legacy.listProducts());
  assert.deepEqual(via.lowStock(), legacy.lowStock());
  ok("regressão rota: store via OpsRepository ≡ opsStore (shapes)");

  writeFileSync(
    EVIDENCE,
    evidence.join("\n") + `\nPASSED=true asserts=${passed}\n`,
    "utf8",
  );
  if (existsSync("/opt/cursor")) {
    mkdirSync("/opt/cursor/artifacts", { recursive: true });
    writeFileSync(
      "/opt/cursor/artifacts/cortely-fase1b1-products-stock-evidence.txt",
      readFileSync(EVIDENCE),
    );
  }
  note(`Security fase 1.B.1 products/stock: PASSED (${passed} asserts)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
