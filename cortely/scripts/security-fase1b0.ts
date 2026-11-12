/**
 * Testes Etapa 1.B.0 — registry (boot, fail-fast, transições) + OpsRepository.
 * Executar: npx tsx scripts/security-fase1b0.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

process.env.CORTELY_SESSION_SECRET ??=
  "ci-session-secret-at-least-16-chars";
process.env.NEXT_PUBLIC_DEMO_MODE ??= "true";

const evidence: string[] = [];
function note(line: string) {
  evidence.push(line);
  console.log(line);
}

async function main() {
  let passed = 0;
  function ok(name: string) {
    passed += 1;
    note(`✓ ${name}`);
  }

  const reg = await import("../src/lib/ops-registry");
  const { createOpsRepository } = await import("../src/lib/ops-repository");
  const { opsStore } = await import("../src/lib/ops-store");

  const seedPath = join(process.cwd(), "config", "ops-registry.json");
  const seedText = readFileSync(seedPath, "utf8");
  const seedJson = JSON.parse(seedText) as Record<
    string,
    { source: string; state: string }
  >;

  // --- Arquivo seed all-json ---
  for (const d of reg.OPS_DOMAINS) {
    assert.ok(seedJson[d], `seed missing ${d}`);
    assert.equal(seedJson[d].source, "json");
    assert.equal(seedJson[d].state, "active_json");
  }
  assert.equal(Object.keys(seedJson).length, reg.OPS_DOMAINS.length);
  ok("ops-registry.json all-json com 16 domínios");

  // --- Load sem tabela (arquivo) ---
  const fromFile = reg.loadRegistry({
    tableExists: false,
    fileContents: seedText,
  });
  assert.equal(fromFile.loadedFrom, "file");
  assert.equal(fromFile.map.sales.source, "json");
  ok("load sem tabela usa arquivo all-json");

  // --- Load com tabela: arquivo ignorado (boot pós-cutover + arquivo all-json) ---
  const tableRows = reg.OPS_DOMAINS.map((domain) => ({
    domain,
    source: "postgres" as const,
    state: "active_postgres" as const,
  }));
  // ops_core all postgres — payment_intents também postgres neste fixture
  const postCutover = reg.loadRegistry({
    tableExists: true,
    tableRows,
    fileContents: seedText, // all-json — DEVE ser ignorado
    envRegistry: undefined,
  });
  assert.equal(postCutover.loadedFrom, "table");
  assert.equal(postCutover.map.sales.source, "postgres");
  assert.equal(postCutover.map.sales.state, "active_postgres");
  note(
    "EVIDENCE boot pós-cutover: arquivo seed all-json presente e ignorado; tabela active_postgres prevalece",
  );
  ok("Boot pós-cutover + arquivo all-json sobe normalmente (arquivo ignorado)");

  // --- CORTELY_OPS_REGISTRY + tabela → fail-fast ---
  assert.throws(
    () =>
      reg.loadRegistry({
        tableExists: true,
        tableRows,
        envRegistry: seedText,
      }),
    (e: unknown) =>
      e instanceof reg.RegistryFailFastError &&
      /CORTELY_OPS_REGISTRY/.test((e as Error).message),
  );
  ok("CORTELY_OPS_REGISTRY + tabela → fail-fast");

  // --- ops_core misto → abort ---
  const mixedMap: Record<string, { source: string; state: string }> = {};
  for (const d of reg.OPS_DOMAINS) {
    mixedMap[d] = { source: "json", state: "active_json" };
  }
  mixedMap.sales = { source: "postgres", state: "active_postgres" };
  assert.throws(
    () => reg.validateRegistryMap(mixedMap as never),
    (e: unknown) =>
      e instanceof reg.RegistryFailFastError && /ops_core misto/.test((e as Error).message),
  );
  assert.throws(
    () =>
      reg.loadRegistry({
        tableExists: true,
        tableRows: Object.entries(mixedMap).map(([domain, v]) => ({
          domain,
          source: v.source,
          state: v.state,
        })),
      }),
    (e: unknown) => e instanceof reg.RegistryFailFastError,
  );
  ok("ops_core misto → abort");

  // --- domínio desconhecido → abort ---
  assert.throws(
    () =>
      reg.validateRegistryMap({
        ...Object.fromEntries(
          reg.OPS_DOMAINS.map((d) => [
            d,
            { source: "json", state: "active_json" },
          ]),
        ),
        units: { source: "json", state: "active_json" },
      } as never),
    (e: unknown) =>
      e instanceof reg.RegistryFailFastError &&
      /desconhecido/.test((e as Error).message),
  );
  ok("domínio desconhecido → abort");

  // --- source↔state inválido → abort ---
  assert.equal(reg.isValidSourceState("json", "active_postgres"), false);
  assert.equal(reg.isValidSourceState("postgres", "prep_pg"), false);
  assert.equal(reg.isValidSourceState("postgres", "cutover_pending"), false);
  assert.equal(reg.isValidSourceState("postgres", "active_postgres"), true);
  assert.throws(
    () =>
      reg.validateRegistryMap({
        ...Object.fromEntries(
          reg.OPS_DOMAINS.map((d) => [
            d,
            { source: "json", state: "active_json" },
          ]),
        ),
        sales: { source: "postgres", state: "prep_pg" },
      } as never),
    (e: unknown) =>
      e instanceof reg.RegistryFailFastError &&
      /source↔state inválido/.test((e as Error).message),
  );
  ok("source↔state inválido → abort");

  // --- Arquivo/env não promovem postgres ---
  const promote = JSON.parse(seedText) as Record<
    string,
    { source: string; state: string }
  >;
  promote.payment_intents = {
    source: "postgres",
    state: "active_postgres",
  };
  assert.throws(
    () =>
      reg.loadRegistry({
        tableExists: false,
        fileContents: JSON.stringify(promote),
      }),
    (e: unknown) =>
      e instanceof reg.RegistryFailFastError &&
      /não podem promover/.test((e as Error).message),
  );
  ok("arquivo/env não promovem active_postgres");

  // --- Transições puras (§3.2.3) ---
  assert.equal(
    reg.isAllowedRegistryTransition(
      { source: "json", state: "active_json" },
      { source: "json", state: "prep_pg" },
    ),
    true,
  );
  assert.equal(
    reg.isAllowedRegistryTransition(
      { source: "json", state: "prep_pg" },
      { source: "json", state: "cutover_pending" },
    ),
    true,
  );
  assert.equal(
    reg.isAllowedRegistryTransition(
      { source: "json", state: "cutover_pending" },
      { source: "json", state: "active_json" },
    ),
    true,
  );
  assert.equal(
    reg.isAllowedRegistryTransition(
      { source: "json", state: "cutover_pending" },
      { source: "postgres", state: "active_postgres" },
    ),
    true,
  );
  assert.equal(
    reg.isAllowedRegistryTransition(
      { source: "postgres", state: "active_postgres" },
      { source: "json", state: "active_json" },
    ),
    false,
  );
  assert.equal(
    reg.isAllowedRegistryTransition(
      { source: "json", state: "active_json" },
      { source: "postgres", state: "active_postgres" },
    ),
    false,
  );
  ok("transições permitidas/proibidas (§3.2.3) — função pura");

  // --- OpsRepository delega com all-json ---
  const sessionBarbershopId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const repo = createOpsRepository({
    registry: fromFile,
    sessionBarbershopId,
  });
  assert.equal(repo.sessionBarbershopId, sessionBarbershopId);
  assert.equal(repo.source("sales"), "json");
  const store = repo.jsonStore;
  assert.equal(store, opsStore);
  const products = store.listProducts();
  assert.ok(Array.isArray(products));
  ok("OpsRepository com ops_core=json delega ao opsStore");

  // --- OpsRepository erro se domínio postgres ---
  const pgSnap = reg.loadRegistry({
    tableExists: true,
    tableRows,
  });
  const repoPg = createOpsRepository({
    registry: pgSnap,
    sessionBarbershopId,
  });
  assert.throws(
    () => repoPg.jsonStore,
    (e: unknown) =>
      e instanceof Error && /adapters PG ainda não existem/.test(e.message),
  );
  ok("OpsRepository: domínio postgres → erro explícito");

  assert.throws(
    () =>
      createOpsRepository({
        registry: fromFile,
        sessionBarbershopId: "",
      }),
    (e: unknown) => e instanceof Error && /sessionBarbershopId/.test(e.message),
  );
  ok("OpsRepository exige barbershop_id da sessão (sem SHOP_ID)");

  note(`Security fase 1.B.0 registry: PASSED (${passed} asserts)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
