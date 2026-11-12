/**
 * Etapa 1.B.0 — aplica migration registry no Postgres local/CI e roda asserts SQL.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "..");
const SQL_DIR = join(ROOT, "scripts/sql");
const MIG_DIR = join(ROOT, "supabase/migrations");
const EVIDENCE = "/tmp/cortely-fase1b0-registry-sql-evidence.txt";
const DB = process.env.CORTELY_REGISTRY_TEST_DB || "cortely_fase1b0_registry_test";

const useTcp =
  Boolean(process.env.PGHOST) || Boolean(process.env.PGPASSWORD);

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

function main() {
  const evidence: string[] = [];
  const note = (l: string) => {
    evidence.push(l);
    console.log(l);
  };

  note("=== Cortely fase1b0 registry SQL ===");
  note(`connection=${useTcp ? "tcp" : "local-sudo"}`);
  ensurePostgres();

  try {
    psqlCmd("postgres", `DROP DATABASE IF EXISTS ${DB}`);
  } catch {
    /* ignore */
  }
  psqlCmd("postgres", `CREATE DATABASE ${DB}`);
  note(`DB ${DB} created`);

  const mig = join(MIG_DIR, "20261112_fase1b_00_ops_registry.sql");
  const tests = join(SQL_DIR, "fase1b0_registry_tests.sql");
  for (const f of [mig, tests]) {
    if (!existsSync(f)) {
      console.error("missing", f);
      process.exit(1);
    }
  }

  note("Applying migration 20261112_fase1b_00_ops_registry…");
  psqlFileAll(DB, mig);
  note("migration OK");

  note("Running registry SQL asserts…");
  let out: string;
  try {
    out = psqlFileAll(DB, tests);
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    const dump = `${err.stdout || ""}\n${err.stderr || ""}\n${err.message || ""}`;
    console.error(dump);
    writeFileSync(EVIDENCE, evidence.join("\n") + "\nFAIL\n" + dump, "utf8");
    process.exit(1);
  }

  note(out);
  const passes = (out.match(/NOTICE:\s+PASS:/g) || []).length;
  note(`PASS notices: ${passes}`);

  if (!out.includes("FASE1B0_REGISTRY_SQL_PASSED")) {
    console.error("missing FASE1B0_REGISTRY_SQL_PASSED");
    process.exit(1);
  }
  if (passes < 10) {
    console.error(`expected >=10 PASS notices, got ${passes}`);
    process.exit(1);
  }

  writeFileSync(EVIDENCE, evidence.join("\n") + "\nPASSED=true\n", "utf8");
  if (existsSync("/opt/cursor")) {
    mkdirSync("/opt/cursor/artifacts", { recursive: true });
    writeFileSync(
      "/opt/cursor/artifacts/cortely-fase1b0-registry-sql-evidence.txt",
      readFileSync(EVIDENCE),
    );
  }
  note(`EVIDENCE ${EVIDENCE}`);
  note(`Security fase 1.B.0 registry SQL: PASSED (${passes} asserts)`);
}

main();
