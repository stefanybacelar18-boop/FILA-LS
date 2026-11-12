/**
 * Testes Etapa 1.B.0 — registry (boot fail-fast, transições) + OpsRepository.
 * Executar: npx tsx scripts/security-fase1b0.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

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

  // --- Fingerprint TS (algoritmo canônico) ---
  const fromFile = reg.loadRegistry({
    tableExists: false,
    fileContents: seedText,
  });
  assert.equal(fromFile.loadedFrom, "file");
  assert.equal(fromFile.map.sales.source, "json");
  const expectedPayload = reg.OPS_DOMAINS.map(
    (d) => `${d}:json:active_json`,
  ).join(",");
  assert.equal(reg.fingerprintCanonicalPayload(fromFile.map), expectedPayload);
  const expectedFp = createHash("sha256")
    .update(expectedPayload)
    .digest("hex")
    .slice(0, 16);
  assert.equal(fromFile.fingerprint, expectedFp);
  assert.equal(reg.fingerprintFromCanonicalPayload(expectedPayload), expectedFp);
  ok("fingerprint TS: sha256 hex[:16] na ordem OPS_DOMAINS");

  // --- Load com tabela: arquivo ignorado (boot pós-cutover + arquivo all-json) ---
  const cutoverAt = "2026-11-12T00:00:00.000Z";
  const tableRows = reg.OPS_DOMAINS.map((domain) => ({
    domain,
    source: "postgres" as const,
    state: "active_postgres" as const,
    cutover_at: cutoverAt,
  }));
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
  ok("tabela active_postgres + arquivo all-json → sobe (arquivo ignorado)");

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
  ok("env + tabela → fail-fast");

  // --- ops_core misto → abort ---
  const mixedMap: Record<
    string,
    { source: string; state: string; cutover_at?: string }
  > = {};
  for (const d of reg.OPS_DOMAINS) {
    mixedMap[d] = { source: "json", state: "active_json" };
  }
  mixedMap.sales = {
    source: "postgres",
    state: "active_postgres",
    cutover_at: cutoverAt,
  };
  assert.throws(
    () => reg.validateRegistryMap(mixedMap as never),
    (e: unknown) =>
      e instanceof reg.RegistryFailFastError &&
      /ops_core misto/.test((e as Error).message),
  );
  assert.throws(
    () =>
      reg.loadRegistry({
        tableExists: true,
        tableRows: Object.entries(mixedMap).map(([domain, v]) => ({
          domain,
          source: v.source,
          state: v.state,
          cutover_at: v.cutover_at,
        })),
      }),
    (e: unknown) => e instanceof reg.RegistryFailFastError,
  );
  ok("ops_core misto → fail-fast");

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

  // --- active_postgres sem cutover_at → abort ---
  assert.throws(
    () =>
      reg.validateRegistryMap({
        ...Object.fromEntries(
          reg.OPS_DOMAINS.map((d) => [
            d,
            {
              source: "postgres",
              state: "active_postgres",
              cutover_at: cutoverAt,
            },
          ]),
        ),
        sales: {
          source: "postgres",
          state: "active_postgres",
          cutover_at: null,
        },
      } as never),
    (e: unknown) =>
      e instanceof reg.RegistryFailFastError &&
      /cutover_at/.test((e as Error).message),
  );
  ok("active_postgres sem cutover_at → fail-fast");

  // --- Arquivo/env não promovem postgres ---
  const promote = JSON.parse(seedText) as Record<string, Record<string, unknown>>;
  promote.payment_intents = {
    source: "postgres",
    state: "active_postgres",
    cutover_at: cutoverAt,
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

  // --- Seed embutido no bundle (sem fs) ---
  assert.equal(
    reg.bundledRegistrySeedText(),
    JSON.stringify(reg.bundledRegistrySeedObject()),
  );
  assert.deepEqual(
    JSON.parse(reg.bundledRegistrySeedText()),
    JSON.parse(seedText),
  );
  ok("seed embutido via import estático bate com config/ops-registry.json");

  // --- resolveRegistryAtBoot: sem Supabase → seed embutido (sem fs) ---
  reg.clearRegistryBootCache();
  const logs: string[] = [];
  const bootFile = await reg.resolveRegistryAtBoot({
    env: {
      NEXT_PUBLIC_DEMO_MODE: "true",
    } as unknown as NodeJS.ProcessEnv,
    // sem readSeedFile → usa bundledRegistrySeedText (sem fs/process.cwd)
    log: (m) => logs.push(m),
  });
  assert.equal(bootFile.loadedFrom, "file");
  assert.equal(bootFile.fingerprint, expectedFp);
  assert.ok(logs.some((l) => /loadedFrom=file/.test(l)));
  assert.equal(reg.getCachedRegistrySnapshot()?.fingerprint, expectedFp);
  ok("boot sem Supabase → seed embutido (sem acesso a fs)");

  // --- isRelationMissingError estrito (só 42P01 / PGRST205) ---
  assert.equal(reg.isRelationMissingError({ code: "42P01" }), true);
  assert.equal(reg.isRelationMissingError({ code: "PGRST205" }), true);
  assert.equal(
    reg.isRelationMissingError({
      code: "42703",
      message: 'column "nope" of relation "ops_domain_registry" does not exist',
    }),
    false,
  );
  assert.equal(
    reg.isRelationMissingError({
      message: 'relation "ops_domain_registry" does not exist',
    }),
    false,
  );
  ok("isRelationMissingError: só 42P01/PGRST205 (sem fallback de mensagem)");

  // --- 42703 / mensagem sem código → fail-fast via boot (não relation_missing) ---
  await assert.rejects(
    () =>
      reg.resolveRegistryAtBoot({
        env: {
          NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
          SUPABASE_SERVICE_ROLE_KEY: "service-role-test-key",
        } as unknown as NodeJS.ProcessEnv,
        readSeedFile: () => {
          throw new Error("seed não deve ser usado para 42703");
        },
        fetchTable: async () => ({
          ok: false,
          kind: "error",
          message: "42703: column does not exist",
        }),
        log: () => {},
      }),
    (e: unknown) =>
      e instanceof reg.RegistryFailFastError && /42703/.test((e as Error).message),
  );
  ok("boot 42703 (coluna inexistente) → fail-fast");

  await assert.rejects(
    () =>
      reg.resolveRegistryAtBoot({
        env: {
          NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
          SUPABASE_SERVICE_ROLE_KEY: "service-role-test-key",
        } as unknown as NodeJS.ProcessEnv,
        readSeedFile: () => {
          throw new Error('seed não deve ser usado para "does not exist" sem código');
        },
        fetchTable: async () => ({
          ok: false,
          kind: "error",
          message: 'ERR: relation "ops_domain_registry" does not exist',
        }),
        log: () => {},
      }),
    (e: unknown) =>
      e instanceof reg.RegistryFailFastError &&
      /does not exist/.test((e as Error).message),
  );
  ok('boot mensagem "does not exist" sem código → fail-fast');

  // --- resolveRegistryAtBoot: tabela inexistente (42P01) → arquivo ---
  reg.clearRegistryBootCache();
  const bootMissing = await reg.resolveRegistryAtBoot({
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test-key",
    } as unknown as NodeJS.ProcessEnv,
    readSeedFile: () => seedText,
    fetchTable: async () => ({ ok: false, kind: "relation_missing" }),
    log: () => {},
  });
  assert.equal(bootMissing.loadedFrom, "file");
  ok("boot tabela inexistente → arquivo");

  // --- REQUIRE_TABLE + relation_missing → fail-fast ---
  await assert.rejects(
    () =>
      reg.resolveRegistryAtBoot({
        env: {
          NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
          SUPABASE_SERVICE_ROLE_KEY: "service-role-test-key",
          CORTELY_OPS_REGISTRY_REQUIRE_TABLE: "true",
        } as unknown as NodeJS.ProcessEnv,
        readSeedFile: () => {
          throw new Error("seed não deve ser usado com REQUIRE_TABLE");
        },
        fetchTable: async () => ({ ok: false, kind: "relation_missing" }),
        log: () => {},
      }),
    (e: unknown) =>
      e instanceof reg.RegistryFailFastError &&
      /REQUIRE_TABLE/.test((e as Error).message),
  );
  ok("REQUIRE_TABLE + relation_missing → fail-fast");

  // --- resolveRegistryAtBoot: erro de rede → fail-fast (nunca arquivo) ---
  reg.clearRegistryBootCache();
  await assert.rejects(
    () =>
      reg.resolveRegistryAtBoot({
        env: {
          NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
          SUPABASE_SERVICE_ROLE_KEY: "service-role-test-key",
        } as unknown as NodeJS.ProcessEnv,
        readSeedFile: () => seedText,
        fetchTable: async () => ({
          ok: false,
          kind: "error",
          message: "ENOTFOUND: network",
        }),
        log: () => {},
      }),
    (e: unknown) =>
      e instanceof reg.RegistryFailFastError &&
      /fail-fast/.test((e as Error).message) &&
      /network|ENOTFOUND|ops_domain_registry/.test((e as Error).message),
  );
  ok("boot erro de rede → fail-fast (sem cair no arquivo)");

  // --- resolveRegistryAtBoot: throw na fetch → fail-fast ---
  await assert.rejects(
    () =>
      reg.resolveRegistryAtBoot({
        env: {
          NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
          SUPABASE_SERVICE_ROLE_KEY: "service-role-test-key",
        } as unknown as NodeJS.ProcessEnv,
        readSeedFile: () => {
          throw new Error("seed should not be read on network throw");
        },
        fetchTable: async () => {
          throw new Error("timeout");
        },
        log: () => {},
      }),
    (e: unknown) =>
      e instanceof reg.RegistryFailFastError && /timeout/.test((e as Error).message),
  );
  ok("boot throw/timeout → fail-fast");

  // --- resolveRegistryAtBoot: tabela ok + env → fail-fast ---
  await assert.rejects(
    () =>
      reg.resolveRegistryAtBoot({
        env: {
          NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
          SUPABASE_SERVICE_ROLE_KEY: "service-role-test-key",
          CORTELY_OPS_REGISTRY: seedText,
        } as unknown as NodeJS.ProcessEnv,
        fetchTable: async () => ({ ok: true, rows: tableRows }),
        log: () => {},
      }),
    (e: unknown) =>
      e instanceof reg.RegistryFailFastError &&
      /CORTELY_OPS_REGISTRY/.test((e as Error).message),
  );
  ok("boot env + tabela → fail-fast");

  // --- resolveRegistryAtBoot: tabela active_postgres → sobe ---
  reg.clearRegistryBootCache();
  const bootTable = await reg.resolveRegistryAtBoot({
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test-key",
    } as unknown as NodeJS.ProcessEnv,
    readSeedFile: () => seedText,
    fetchTable: async () => ({ ok: true, rows: tableRows }),
    log: (m) => logs.push(m),
  });
  assert.equal(bootTable.loadedFrom, "table");
  assert.equal(bootTable.map.sales.source, "postgres");
  ok("boot tabela active_postgres + arquivo all-json → sobe");

  // --- OpsRepository delega com all-json ---
  const sessionBarbershopId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const repo = createOpsRepository({
    registry: fromFile,
    sessionBarbershopId,
  });
  assert.equal(repo.sessionBarbershopId, sessionBarbershopId);
  assert.equal(repo.source("sales"), "json");
  const store = repo.jsonStore;
  // Delegação funcional (sem assert de referência — tsx/CI pode duplicar Module records)
  assert.equal(typeof store.listProducts, "function");
  assert.deepEqual(store.listProducts(), opsStore.listProducts());
  assert.deepEqual(store.listUnits(), opsStore.listUnits());
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

  // --- instrumentation registra boot fail-fast (nodejs) ---
  const instr = readFileSync(
    join(process.cwd(), "src", "instrumentation.ts"),
    "utf8",
  );
  const instrNode = readFileSync(
    join(process.cwd(), "src", "instrumentation.node.ts"),
    "utf8",
  );
  assert.match(instr, /NEXT_RUNTIME/);
  assert.match(instr, /instrumentation\.node/);
  assert.match(instrNode, /resolveRegistryAtBoot/);
  assert.match(instrNode, /RegistryFailFastError/);
  ok("instrumentation.ts registra boot fail-fast (nodejs)");

  note(`Security fase 1.B.0 registry: PASSED (${passed} asserts)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
