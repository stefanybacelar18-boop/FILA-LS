/**
 * Smoke do boot real pós-build (Next instrumentation):
 * 1) CORTELY_OPS_REGISTRY com ops_core misto, sem Supabase → não atende 2xx
 * 2) registry all-json válido → GET / = 200
 *
 * Observa e registra o comportamento (exit do processo vs HTTP 5xx).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { OPS_DOMAINS } from "../src/lib/ops-registry";

const require = createRequire(import.meta.url);

const PORT_BASE = 4310;
const HOST = "127.0.0.1";

function note(line: string) {
  console.log(line);
}

async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, HOST, () => {
      const addr = s.address();
      if (!addr || typeof addr === "string") {
        s.close();
        reject(new Error("no port"));
        return;
      }
      const port = addr.port;
      s.close(() => resolve(port));
    });
  });
}

function mixedOpsCoreRegistry(): string {
  const map: Record<string, { source: string; state: string; cutover_at?: string }> =
    {};
  for (const d of OPS_DOMAINS) {
    map[d] = { source: "json", state: "active_json" };
  }
  map.sales = {
    source: "postgres",
    state: "active_postgres",
    cutover_at: "2026-11-12T00:00:00.000Z",
  };
  return JSON.stringify(map);
}

function allJsonRegistry(): string {
  const map: Record<string, { source: string; state: string }> = {};
  for (const d of OPS_DOMAINS) {
    map[d] = { source: "json", state: "active_json" };
  }
  return JSON.stringify(map);
}

type RunResult = {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  httpStatus: number | null;
  httpError: string | null;
  observed: string;
};

async function runNextStart(opts: {
  label: string;
  env: Record<string, string | undefined>;
  port: number;
  waitMs: number;
}): Promise<RunResult> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...opts.env,
    PORT: String(opts.port),
    HOSTNAME: HOST,
  };
  // Forçar caminho sem tabela (seed/env) — sem service role
  delete env.NEXT_PUBLIC_SUPABASE_URL;
  delete env.SUPABASE_SERVICE_ROLE_KEY;
  env.NEXT_PUBLIC_SUPABASE_URL = "";
  env.SUPABASE_SERVICE_ROLE_KEY = "";

  const child: ChildProcess = spawn(
    process.execPath,
    [require.resolve("next/dist/bin/next"), "start", "-H", HOST, "-p", String(opts.port)],
    {
      cwd: process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (b) => {
    stdout += String(b);
  });
  child.stderr?.on("data", (b) => {
    stderr += String(b);
  });

  let exitCode: number | null = null;
  let signal: NodeJS.Signals | null = null;
  const exitPromise = new Promise<void>((resolve) => {
    child.on("exit", (code, sig) => {
      exitCode = code;
      signal = sig;
      resolve();
    });
  });

  const deadline = Date.now() + opts.waitMs;
  let httpStatus: number | null = null;
  let httpError: string | null = null;

  while (Date.now() < deadline) {
    if (exitCode !== null) break;
    try {
      const res = await fetch(`http://${HOST}:${opts.port}/`, {
        redirect: "manual",
        signal: AbortSignal.timeout(1500),
      });
      httpStatus = res.status;
      // qualquer resposta HTTP conta como "atendeu"
      break;
    } catch (e) {
      httpError = e instanceof Error ? e.message : String(e);
      await sleep(250);
    }
  }

  if (exitCode === null) {
    child.kill("SIGTERM");
    const killDeadline = Date.now() + 5000;
    while (exitCode === null && Date.now() < killDeadline) {
      await sleep(100);
    }
    if (exitCode === null) {
      child.kill("SIGKILL");
      await exitPromise;
    } else {
      await exitPromise;
    }
  } else {
    await exitPromise;
  }

  let observed: string;
  if (exitCode !== null && exitCode !== 0 && httpStatus === null) {
    observed = `process_exit_before_listen code=${exitCode}`;
  } else if (httpStatus !== null && httpStatus >= 500) {
    observed = `http_${httpStatus}`;
  } else if (httpStatus !== null && httpStatus >= 200 && httpStatus < 300) {
    observed = `http_${httpStatus}`;
  } else if (httpStatus !== null) {
    observed = `http_${httpStatus}`;
  } else {
    observed = `no_http_response exit=${exitCode} err=${httpError || ""}`;
  }

  note(`[${opts.label}] observed=${observed}`);
  note(`[${opts.label}] exitCode=${exitCode} signal=${signal}`);
  if (stdout.trim()) note(`[${opts.label}] stdout_tail=${stdout.trim().slice(-800)}`);
  if (stderr.trim()) note(`[${opts.label}] stderr_tail=${stderr.trim().slice(-800)}`);

  return { exitCode, signal, stdout, stderr, httpStatus, httpError, observed };
}

function isFailFastOutcome(r: RunResult): boolean {
  if (r.httpStatus !== null && r.httpStatus >= 200 && r.httpStatus < 300) {
    return false;
  }
  if (r.httpStatus !== null && r.httpStatus >= 500) return true;
  if (r.exitCode !== null && r.exitCode !== 0 && r.httpStatus === null) return true;
  // processo saiu 0 sem responder 2xx também conta como não-atendimento 2xx
  if (r.httpStatus === null) return true;
  return false;
}

async function main() {
  note("=== Cortely fase1b0 boot smoke (next start) ===");
  const secret = process.env.CORTELY_SESSION_SECRET || "ci-session-secret-at-least-16-chars";

  const mixedPort = await freePort();
  const mixed = await runNextStart({
    label: "ops_core_misto",
    port: mixedPort,
    waitMs: 20000,
    env: {
      CORTELY_SESSION_SECRET: secret,
      NEXT_PUBLIC_DEMO_MODE: "true",
      CORTELY_OPS_REGISTRY: mixedOpsCoreRegistry(),
      CORTELY_OPS_REGISTRY_REQUIRE_TABLE: "",
    },
  });

  if (!isFailFastOutcome(mixed)) {
    console.error(
      `FAIL: ops_core misto atendeu 2xx (status=${mixed.httpStatus}). Esperado fail-fast.`,
    );
    process.exit(1);
  }
  note(
    `PASS: ops_core misto não atende 2xx (observado: ${mixed.observed})`,
  );

  await sleep(500);
  const okPort = await freePort();
  const ok = await runNextStart({
    label: "all_json_ok",
    port: okPort,
    waitMs: 25000,
    env: {
      CORTELY_SESSION_SECRET: secret,
      NEXT_PUBLIC_DEMO_MODE: "true",
      CORTELY_OPS_REGISTRY: allJsonRegistry(),
      CORTELY_OPS_REGISTRY_REQUIRE_TABLE: "",
    },
  });

  if (ok.httpStatus !== 200) {
    console.error(
      `FAIL: all-json esperado GET / = 200, got status=${ok.httpStatus} observed=${ok.observed}`,
    );
    process.exit(1);
  }
  note("PASS: all-json GET / → 200");

  note("SMOKE_FASE1B0_BOOT_PASSED");
  note(
    `EVIDENCE mixed=${mixed.observed}; all_json=http_${ok.httpStatus}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
