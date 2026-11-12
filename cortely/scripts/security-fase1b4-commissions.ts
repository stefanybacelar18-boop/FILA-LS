/**
 * 1.B.4 — migration commissions + contrato JSON↔PG + P24 + concorrência + isolamento.
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import pg from "pg";
import {
  createJsonCommissionsRepository,
  createPgCommissionsRepository,
} from "../src/lib/commissions-repository";
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
const EVIDENCE = "/tmp/cortely-fase1b4-commissions-evidence.txt";
const DB = process.env.CORTELY_FASE1B4_TEST_DB || "cortely_fase1b4_commissions_test";

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

/** Arredondamento por item (PG) vs soma depois arredonda (JSON) — documentar delta. */
function jsonAccrueTotal(
  items: Array<{ kind: string; unit_price: number; quantity: number }>,
  servicePct: number,
  productPct: number,
): number {
  let amount = 0;
  for (const item of items) {
    const line = item.unit_price * item.quantity;
    const pct = item.kind === "product" ? productPct : servicePct;
    amount += (line * pct) / 100;
  }
  return Math.round(amount * 100) / 100;
}

function pgAccrueTotal(
  items: Array<{ kind: string; unit_price: number; quantity: number }>,
  servicePct: number,
  productPct: number,
): number {
  let amount = 0;
  for (const item of items) {
    const basis = Math.round(item.unit_price * item.quantity * 100) / 100;
    const pct = item.kind === "product" ? productPct : servicePct;
    amount += Math.round((basis * pct) / 100 * 100) / 100;
  }
  return Math.round(amount * 100) / 100;
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

  note("=== Cortely fase1b4 commissions ===");
  ensurePostgres();
  ensurePostgresTcpPassword();

  const harness = join(SQL_DIR, "fase1b4_commissions_harness.sql");
  const mig = join(MIG_DIR, "20261112_fase1b_04_commissions.sql");
  const tests = join(SQL_DIR, "fase1b4_commissions_tests.sql");
  for (const f of [harness, mig, tests]) {
    if (!existsSync(f)) {
      console.error("missing", f);
      process.exit(1);
    }
  }

  recreateDb(DB);
  note("Applying harness…");
  psqlFileAll(DB, harness);
  note("Applying migration 20261112_fase1b_04…");
  psqlFileAll(DB, mig);
  note("Running SQL asserts…");
  const sqlOut = psqlFileAll(DB, tests);
  note(sqlOut.slice(-2500));
  if (!sqlOut.includes("FASE1B4_COMMISSIONS_SQL_PASSED")) {
    console.error("missing FASE1B4_COMMISSIONS_SQL_PASSED");
    process.exit(1);
  }
  ok("SQL asserts accrual/reverse/clawback/P24/grants/isolamento");

  let pool: pg.Pool | null = null;
  try {
    pool = new pg.Pool(pgConfig());
    await pool.query("SELECT 1");
  } catch (e) {
    note(
      `WARN: node-pg indisponível (${e instanceof Error ? e.message : e}); pulando contrato TS`,
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

    // —— Contrato JSON×PG ——
    const shop = randomUUID();
    const barber = randomUUID();
    const svc = randomUUID();
    await pool.query(
      `INSERT INTO public.barbershops (id, name, slug) VALUES ($1,'Contract Comm','contract-comm')`,
      [shop],
    );
    await pool.query(
      `INSERT INTO public.barbers (id, barbershop_id, name) VALUES ($1,$2,'B')`,
      [barber, shop],
    );
    await pool.query(
      `INSERT INTO public.services (id, barbershop_id, name, price) VALUES ($1,$2,'S',50)`,
      [svc, shop],
    );

    const pgRepo = createPgCommissionsRepository(db, shop);
    const jsonRepo = createJsonCommissionsRepository(opsStore, shop);

    await jsonRepo.setCommissionRule({
      barber_id: null,
      service_percent: 40,
      product_percent: 10,
    });
    await pgRepo.setCommissionRule({
      barber_id: null,
      service_percent: 40,
      product_percent: 10,
    });

    // Itens com potencial diferença de centavos se arredondar por item
    const items = [
      { kind: "service", unit_price: 33.33, quantity: 1 },
      { kind: "service", unit_price: 33.33, quantity: 1 },
      { kind: "product", unit_price: 19.99, quantity: 1 },
    ];
    const jTotal = jsonAccrueTotal(items, 40, 10);
    const pExpected = pgAccrueTotal(items, 40, 10);
    note(
      `doc arredondamento: JSON (soma→round)=${jTotal}; PG (round por item→soma)=${pExpected}` +
        (jTotal === pExpected
          ? " — iguais neste fixture"
          : ` — delta=${Math.abs(jTotal - pExpected).toFixed(2)} (documentado)`),
    );

    // JSON: 1 entry por venda (opsStore.accrueCommission — caminho do adapter JSON)
    const saleJson = randomUUID();
    const jEntry = opsStore.accrueCommission({
      barber_id: barber,
      sale_id: saleJson,
      items,
    });
    assert.ok(jEntry);
    assert.equal(jEntry!.amount, jTotal);
    // listRules no adapter JSON espelha o store
    assert.ok((await jsonRepo.listRules()).length >= 1);

    // PG: sale + items
    const salePg = randomUUID();
    const itemIds = items.map(() => randomUUID());
    await pool.query(
      `INSERT INTO public.sales (id, barbershop_id, barber_id, subtotal, total, status)
       VALUES ($1,$2,$3,$4,$4,'paid')`,
      [salePg, shop, barber, 86.65],
    );
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      await pool.query(
        `INSERT INTO public.sale_items (
           id, sale_id, barbershop_id, kind, ref_id, description, quantity, unit_price, total
         ) VALUES ($1,$2,$3,$4,$5,$4,$6,$7,$8)`,
        [
          itemIds[i],
          salePg,
          shop,
          it.kind,
          `ref-${i}`,
          it.quantity,
          it.unit_price,
          it.unit_price * it.quantity,
        ],
      );
    }
    const pEntries = await pgRepo.accrueForSale(salePg);
    assert.equal(pEntries.length, 3);
    const pSum = Math.round(
      pEntries.reduce((a, e) => a + e.amount, 0) * 100,
    ) / 100;
    assert.equal(pSum, pExpected);
    // Totais por venda: iguais se não houver delta de centavos; senão documentado
    if (jTotal === pSum) {
      assert.equal(jTotal, pSum);
    } else {
      assert.ok(Math.abs(jTotal - pSum) <= 0.02);
    }
    ok("contrato JSON×PG: accrual (serviço+produto); arredondamento documentado");

    // Regra por barbeiro vs padrão
    const barber2 = randomUUID();
    await pool.query(
      `INSERT INTO public.barbers (id, barbershop_id, name) VALUES ($1,$2,'B2')`,
      [barber2, shop],
    );
    await pgRepo.setCommissionRule({
      barber_id: barber2,
      service_percent: 50,
      product_percent: 0,
    });
    const saleB2 = randomUUID();
    const itemB2 = randomUUID();
    await pool.query(
      `INSERT INTO public.sales (id, barbershop_id, barber_id, total, status)
       VALUES ($1,$2,$3,100,'paid')`,
      [saleB2, shop, barber2],
    );
    await pool.query(
      `INSERT INTO public.sale_items (
         id, sale_id, barbershop_id, kind, ref_id, description, quantity, unit_price, total
       ) VALUES ($1,$2,$3,'service','s','S',1,100,100)`,
      [itemB2, saleB2, shop],
    );
    const eB2 = await pgRepo.accrueForSale(saleB2);
    assert.equal(eB2.length, 1);
    assert.equal(eB2[0].amount, 50);
    ok("regra por barbeiro tem prioridade sobre padrão");

    // Pagamento sem vale
    const pay = await pgRepo.payCommissions(barber2, "actor");
    assert.equal(pay.count, 1);
    assert.equal(pay.gross, 50);
    assert.equal(pay.advances_deducted, 0);
    assert.equal(pay.net, 50);
    assert.equal(pay.total, 50);

    // Ranking
    const month = new Date().toISOString().slice(0, 7);
    await pgRepo.upsertGoal({
      barber_id: barber2,
      month,
      revenue_target: 1000,
      services_target: 20,
    });
    const rank = await pgRepo.ranking(month);
    const row = rank.find((r) => r.barber_id === barber2);
    assert.ok(row);
    assert.equal(row!.revenue, 100);
    assert.equal(row!.commission, 50);
    assert.ok(row!.goal);
    assert.equal(row!.goal!.revenue_target, 1000);
    ok("pagamento sem vale + ranking");

    // Concorrência: duas pays simultâneas — cada entry paga uma vez
    const shopRace = randomUUID();
    const barberRace = randomUUID();
    await pool.query(
      `INSERT INTO public.barbershops (id, name, slug) VALUES ($1,'Race','race-comm')`,
      [shopRace],
    );
    await pool.query(
      `INSERT INTO public.barbers (id, barbershop_id, name) VALUES ($1,$2,'R')`,
      [barberRace, shopRace],
    );
    await pool.query(
      `INSERT INTO public.commission_rules (
         barbershop_id, barber_id, service_percent, product_percent
       ) VALUES ($1,NULL,100,0)`,
      [shopRace],
    );
    const saleRace = randomUUID();
    const itemRace1 = randomUUID();
    const itemRace2 = randomUUID();
    await pool.query(
      `INSERT INTO public.sales (id, barbershop_id, barber_id, total, status)
       VALUES ($1,$2,$3,200,'paid')`,
      [saleRace, shopRace, barberRace],
    );
    await pool.query(
      `INSERT INTO public.sale_items (
         id, sale_id, barbershop_id, kind, ref_id, description, quantity, unit_price, total
       ) VALUES
         ($1,$3,$4,'service','a','A',1,100,100),
         ($2,$3,$4,'service','b','B',1,100,100)`,
      [itemRace1, itemRace2, saleRace, shopRace],
    );
    const raceRepo = createPgCommissionsRepository(db, shopRace);
    await raceRepo.accrueForSale(saleRace);
    const races = await Promise.allSettled([
      raceRepo.payCommissions(barberRace, "r1"),
      raceRepo.payCommissions(barberRace, "r2"),
    ]);
    const fulfilled = races.filter((r) => r.status === "fulfilled") as Array<{
      status: "fulfilled";
      value: { count: number; gross: number };
    }>;
    assert.ok(fulfilled.length >= 1);
    const totalPaid = fulfilled.reduce((a, r) => a + r.value.count, 0);
    assert.equal(totalPaid, 2);
    const paidRows = await pool.query(
      `SELECT count(*)::int AS n FROM public.commission_entries
       WHERE barbershop_id = $1 AND status = 'paid'`,
      [shopRace],
    );
    assert.equal(Number(paidRows.rows[0].n), 2);
    const payouts = await pool.query(
      `SELECT count(*)::int AS n, coalesce(sum(gross),0)::numeric AS g
       FROM public.commission_payouts WHERE barbershop_id = $1`,
      [shopRace],
    );
    assert.equal(Number(payouts.rows[0].g), 200);
    ok("pagamento concorrente: cada entry paga uma única vez");

    // Accrual concorrente: UNIQUE → no-op, sem falha
    const shopAcc = randomUUID();
    const barberAcc = randomUUID();
    const saleAcc = randomUUID();
    const itemAcc = randomUUID();
    await pool.query(
      `INSERT INTO public.barbershops (id, name, slug) VALUES ($1,'Acc','acc-comm')`,
      [shopAcc],
    );
    await pool.query(
      `INSERT INTO public.barbers (id, barbershop_id, name) VALUES ($1,$2,'A')`,
      [barberAcc, shopAcc],
    );
    await pool.query(
      `INSERT INTO public.commission_rules (
         barbershop_id, barber_id, service_percent, product_percent
       ) VALUES ($1,NULL,40,0)`,
      [shopAcc],
    );
    await pool.query(
      `INSERT INTO public.sales (id, barbershop_id, barber_id, total, status)
       VALUES ($1,$2,$3,100,'paid')`,
      [saleAcc, shopAcc, barberAcc],
    );
    await pool.query(
      `INSERT INTO public.sale_items (
         id, sale_id, barbershop_id, kind, ref_id, description, quantity, unit_price, total
       ) VALUES ($1,$2,$3,'service','s','S',1,100,100)`,
      [itemAcc, saleAcc, shopAcc],
    );
    const accResults = await Promise.allSettled([
      pool.query(`SELECT * FROM public.ops_accrue_commission($1,$2)`, [
        shopAcc,
        saleAcc,
      ]),
      pool.query(`SELECT * FROM public.ops_accrue_commission($1,$2)`, [
        shopAcc,
        saleAcc,
      ]),
    ]);
    assert.equal(
      accResults.filter((r) => r.status === "fulfilled").length,
      2,
      `accrue paralelo falhou: ${accResults.map((r) => (r.status === "rejected" ? String(r.reason) : "ok")).join(" | ")}`,
    );
    const accCount = await pool.query(
      `SELECT count(*)::int AS n FROM public.commission_entries
       WHERE barbershop_id = $1 AND sale_id = $2 AND status = 'pending'`,
      [shopAcc, saleAcc],
    );
    assert.equal(Number(accCount.rows[0].n), 1);
    ok("accrual concorrente: sem falha, 1 entry por item");

    // Corrida reverse × pay: reverse segura TX; pay bloqueia; após commit pay não paga
    const shopRevPay = randomUUID();
    const barberRevPay = randomUUID();
    const saleRevPay = randomUUID();
    const itemRevPay = randomUUID();
    await pool.query(
      `INSERT INTO public.barbershops (id, name, slug) VALUES ($1,'RevPay','revpay')`,
      [shopRevPay],
    );
    await pool.query(
      `INSERT INTO public.barbers (id, barbershop_id, name) VALUES ($1,$2,'R')`,
      [barberRevPay, shopRevPay],
    );
    await pool.query(
      `INSERT INTO public.commission_rules (
         barbershop_id, barber_id, service_percent, product_percent
       ) VALUES ($1,NULL,50,0)`,
      [shopRevPay],
    );
    await pool.query(
      `INSERT INTO public.sales (id, barbershop_id, barber_id, total, status)
       VALUES ($1,$2,$3,200,'paid')`,
      [saleRevPay, shopRevPay, barberRevPay],
    );
    await pool.query(
      `INSERT INTO public.sale_items (
         id, sale_id, barbershop_id, kind, ref_id, description, quantity, unit_price, total
       ) VALUES ($1,$2,$3,'service','s','S',1,200,200)`,
      [itemRevPay, saleRevPay, shopRevPay],
    );
    await pool.query(`SELECT * FROM public.ops_accrue_commission($1,$2)`, [
      shopRevPay,
      saleRevPay,
    ]);

    const clientA = await pool.connect();
    const clientB = await pool.connect();
    try {
      await clientA.query("BEGIN");
      const rev = await clientA.query(
        `SELECT * FROM public.ops_reverse_pending_commissions($1,$2)`,
        [shopRevPay, saleRevPay],
      );
      assert.ok(rev.rowCount && rev.rowCount >= 1);

      let payDone = false;
      type PayRow = { count: number; gross: string | number };
      let payRow: PayRow | undefined;
      const payPromise = clientB
        .query<PayRow>(`SELECT * FROM public.ops_pay_commissions($1,$2,$3)`, [
          shopRevPay,
          barberRevPay,
          "race-b",
        ])
        .then((res) => {
          payDone = true;
          payRow = res.rows[0];
          return res;
        });

      // Pay deve estar bloqueado enquanto A segura a TX
      await new Promise((r) => setTimeout(r, 400));
      assert.equal(payDone, false, "pay não deveria concluir antes do commit da reverse");

      await clientA.query("COMMIT");
      await payPromise;
      assert.ok(payRow, "pay deveria retornar row");
      assert.equal(Number(payRow.count), 0);
      assert.equal(Number(payRow.gross), 0);

      const paidN = await pool.query(
        `SELECT count(*)::int AS n FROM public.commission_entries
         WHERE barbershop_id = $1 AND status = 'paid'`,
        [shopRevPay],
      );
      assert.equal(Number(paidN.rows[0].n), 0);
      ok("corrida reverse×pay: após commit da reverse, pay não paga (gross=0)");
    } finally {
      try {
        await clientA.query("ROLLBACK");
      } catch {
        /* already committed */
      }
      clientA.release();
      clientB.release();
    }

    // OpsRepository: PG só com commissions=postgres
    const allJson = loadRegistry({
      tableExists: false,
      fileContents: bundledRegistrySeedText(),
    });
    const repoJson = createOpsRepository({
      registry: allJson,
      sessionBarbershopId: shop,
      pg: db,
    });
    assert.equal(repoJson.source("commissions"), "json");

    const cutoverAt = "2026-11-12T00:00:00.000Z";
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
    assert.equal(repoPg.source("commissions"), "postgres");
    const viaPg = repoPg.commissions();
    const rules = await viaPg.listRules();
    assert.ok(rules.length >= 1);
    ok("OpsRepository entrega PG só com commissions=postgres");
  }

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
