/**
 * Etapa 1.A — testes reais de isolamento SQL com PostgreSQL + RLS.
 * Sobe DB efêmero, aplica harness + migrations 03/06, executa asserts A×B.
 *
 * Conexão:
 * - CI / remoto: PGHOST+PGUSER+PGPASSWORD (service container)
 * - Local: sudo -u postgres (cluster do sistema)
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "..");
const SQL_DIR = join(ROOT, "scripts/sql");
const MIG_DIR = join(ROOT, "supabase/migrations");
const EVIDENCE = "/tmp/cortely-fase1a-rls-sql-evidence.txt";
const DB = process.env.CORTELY_RLS_TEST_DB || "cortely_fase1a_rls_test";

const useTcp =
  Boolean(process.env.PGHOST) || Boolean(process.env.PGPASSWORD);

function sh(cmd: string) {
  return execSync(cmd, {
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
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

function shellQuote(s: string) {
  if (/^[a-zA-Z0-9_./:@=-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function ensurePostgres() {
  if (useTcp) {
    // Aguarda service container
    for (let i = 0; i < 30; i++) {
      try {
        psqlCmd("postgres", "SELECT 1");
        return;
      } catch {
        sh("sleep 2");
      }
    }
    console.error("PostgreSQL TCP indisponível (PGHOST/PGPASSWORD)");
    process.exit(1);
  }
  try {
    sh("sudo -u postgres psql -c 'SELECT 1' >/dev/null");
    return;
  } catch {
    /* try start */
  }
  try {
    sh("sudo pg_ctlcluster 16 main start");
  } catch {
    try {
      sh("sudo service postgresql start");
    } catch (e) {
      console.error("PostgreSQL indisponível:", e);
      process.exit(1);
    }
  }
  sh("sudo -u postgres psql -c 'SELECT 1' >/dev/null");
}

function psqlFileAll(db: string, file: string): string {
  const args = psqlArgs(db, ["-v", "ON_ERROR_STOP=1", "-f", file]);
  return execSync(`${args.map(shellQuote).join(" ")} 2>&1`, {
    encoding: "utf8",
    env: process.env,
  });
}

function main() {
  const evidence: string[] = [];
  const note = (l: string) => {
    evidence.push(l);
    console.log(l);
  };

  note("=== Cortely fase1a RLS SQL isolation ===");
  note(`connection=${useTcp ? "tcp" : "local-sudo"}`);
  ensurePostgres();
  note("PostgreSQL up");

  try {
    psqlCmd("postgres", `DROP DATABASE IF EXISTS ${DB}`);
  } catch {
    /* ignore */
  }
  psqlCmd("postgres", `CREATE DATABASE ${DB}`);
  note(`DB ${DB} created`);

  psqlCmd(DB, "CREATE EXTENSION IF NOT EXISTS pgcrypto");

  const harness = join(SQL_DIR, "fase1a_rls_isolation_harness.sql");
  const mig03 = join(MIG_DIR, "20261111_03_fase1a_ops_rls.sql");
  const mig06 = join(MIG_DIR, "20261111_06_fase1a_schema_privileges.sql");
  const tests = join(SQL_DIR, "fase1a_rls_isolation_tests.sql");

  for (const f of [harness, mig03, mig06, tests]) {
    if (!existsSync(f)) {
      console.error("missing", f);
      process.exit(1);
    }
  }

  note("Applying harness…");
  psqlFileAll(DB, harness);
  note("harness OK");

  note("Applying migration 20261111_03 (ENABLE+FORCE + policies)…");
  psqlFileAll(DB, mig03);
  note("migration 03 OK (FORCE RLS enforced, no silent swallow)");

  note("Applying migration 20261111_06 (schema privileges)…");
  psqlFileAll(DB, mig06);
  note("migration 06 OK");

  note("Running isolation asserts (authenticated A×B)…");
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

  const passes = (out.match(/NOTICE:\s+PASS:/g) || []).length;
  note(out);
  note(`PASS notices: ${passes}`);

  if (!out.includes("FASE1A_RLS_SQL_ISOLATION_PASSED")) {
    console.error("missing final PASSED marker");
    process.exit(1);
  }
  if (passes < 40) {
    console.error(`expected >=40 PASS notices, got ${passes}`);
    process.exit(1);
  }

  const invArgs = psqlArgs(DB, [
    "-Atc",
    `SELECT 'schema_public_acl|' || COALESCE(nspacl::text, '<null>')
FROM pg_namespace WHERE nspname='public';
SELECT 'schema_public|' || r.rolname || '|USAGE=' ||
  has_schema_privilege(r.rolname,'public','USAGE')::text || '|CREATE=' ||
  has_schema_privilege(r.rolname,'public','CREATE')::text
FROM pg_roles r
WHERE r.rolname IN ('anon','authenticated','service_role','postgres');
SELECT 'fn_ubarbershop|EXECUTE_authenticated=' ||
  has_function_privilege('authenticated','public.user_barbershop_id()','EXECUTE')::text ||
  '|EXECUTE_anon=' ||
  has_function_privilege('anon','public.user_barbershop_id()','EXECUTE')::text;
SELECT 'fn_provision|EXECUTE_authenticated=' ||
  has_function_privilege('authenticated',
    'public.provision_owner_barbershop(uuid,text,text,text,text,text)','EXECUTE')::text ||
  '|EXECUTE_service_role=' ||
  has_function_privilege('service_role',
    'public.provision_owner_barbershop(uuid,text,text,text,text,text)','EXECUTE')::text;
SELECT 'rls|' || c.relname || '|rls=' || c.relrowsecurity::text ||
  '|force=' || c.relforcerowsecurity::text
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN (
  'sale_items','sale_payments','sales','products','ops_audit_log'
)
ORDER BY 1;`,
  ]);
  const inv = execSync(invArgs.map(shellQuote).join(" "), {
    encoding: "utf8",
    env: process.env,
  });
  note("--- privilege inventory ---");
  note(inv.trim());

  writeFileSync(EVIDENCE, evidence.join("\n") + "\nPASSED=true\n", "utf8");
  if (existsSync("/opt/cursor")) {
    mkdirSync("/opt/cursor/artifacts", { recursive: true });
    writeFileSync(
      "/opt/cursor/artifacts/cortely-fase1a-rls-sql-evidence.txt",
      readFileSync(EVIDENCE),
    );
  }
  note(`EVIDENCE ${EVIDENCE}`);
  note(`Security fase 1.A RLS SQL: isolation PASSED (${passes} asserts)`);
}

main();
