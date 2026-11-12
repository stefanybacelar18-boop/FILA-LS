/**
 * Cortely 1.B.0 — registry global de fontes ops (json | postgres).
 * Carregamento e validação conforme plano §3.2.2 / §3.2.3 / §3.2.4.
 * Sem API de flip nesta etapa — apenas função pura de transição (testada).
 *
 * Seed all-json: embutido no bundle via import estático (Vercel/CI).
 * CORTELY_OPS_REGISTRY_REQUIRE_TABLE=true → relation_missing vira fail-fast
 * (ligar quando 20261112_fase1b_00 for aplicada no remoto; não agora).
 */

import { createHash } from "crypto";
import opsRegistrySeed from "../../config/ops-registry.json";

export const OPS_DOMAINS = [
  "products",
  "stock",
  "cash",
  "sales",
  "commissions",
  "packages",
  "purchasing",
  "payables",
  "receivables",
  "coupons",
  "deposits",
  "campaigns",
  "waitlist",
  "reviews",
  "fiscal",
  "payment_intents",
] as const;

export type OpsDomain = (typeof OPS_DOMAINS)[number];

export const OPS_CORE_DOMAINS = [
  "sales",
  "products",
  "stock",
  "cash",
  "commissions",
  "purchasing",
  "payables",
  "packages",
] as const satisfies readonly OpsDomain[];

export type OpsSource = "json" | "postgres";
export type OpsRegistryState =
  | "active_json"
  | "prep_pg"
  | "cutover_pending"
  | "active_postgres";

export type DomainRegistryEntry = {
  source: OpsSource;
  state: OpsRegistryState;
  cutover_at?: string | null;
  updated_at?: string | null;
  updated_by?: string | null;
};

export type RegistryMap = Record<OpsDomain, DomainRegistryEntry>;

export type RegistrySnapshot = {
  map: RegistryMap;
  fingerprint: string;
  loadedFrom: "table" | "file" | "env";
};

export class RegistryFailFastError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistryFailFastError";
  }
}

export function isOpsDomain(value: string): value is OpsDomain {
  return (OPS_DOMAINS as readonly string[]).includes(value);
}

/** CHECK source↔state (migration + boot). */
export function isValidSourceState(
  source: OpsSource,
  state: OpsRegistryState,
): boolean {
  if (source === "json") {
    return (
      state === "active_json" ||
      state === "prep_pg" ||
      state === "cutover_pending"
    );
  }
  return state === "active_postgres";
}

export type RegistryTransition = {
  source: OpsSource;
  state: OpsRegistryState;
};

/**
 * Transições permitidas (§3.2.3) — função PURA, só testada.
 * Não executa flip; não persiste; sem rota/API.
 */
export function isAllowedRegistryTransition(
  from: RegistryTransition,
  to: RegistryTransition,
): boolean {
  if (!isValidSourceState(from.source, from.state)) return false;
  if (!isValidSourceState(to.source, to.state)) return false;

  const key = `${from.source}:${from.state}->${to.source}:${to.state}`;
  const allowed = new Set([
    "json:active_json->json:prep_pg",
    "json:prep_pg->json:cutover_pending",
    "json:cutover_pending->json:active_json",
    "json:cutover_pending->postgres:active_postgres",
  ]);
  return allowed.has(key);
}

/** Payload canônico — mesma ordem OPS_DOMAINS no SQL e no TS. */
export function fingerprintCanonicalPayload(map: RegistryMap): string {
  return OPS_DOMAINS.map((d) => `${d}:${map[d].source}:${map[d].state}`).join(
    ",",
  );
}

/** sha256 hex, primeiros 16 chars — idêntico a left(encode(digest(...),'hex'),16) no PG. */
export function fingerprintFromCanonicalPayload(payload: string): string {
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

export function fingerprintRegistryMap(map: RegistryMap): string {
  return fingerprintFromCanonicalPayload(fingerprintCanonicalPayload(map));
}

function assertEntry(
  domain: string,
  entry: unknown,
): asserts entry is DomainRegistryEntry {
  if (!entry || typeof entry !== "object") {
    throw new RegistryFailFastError(
      `Registry: entrada inválida para domínio '${domain}'`,
    );
  }
  const e = entry as Record<string, unknown>;
  const source = e.source;
  const state = e.state;
  if (source !== "json" && source !== "postgres") {
    throw new RegistryFailFastError(
      `Registry: source inválido em '${domain}': ${String(source)}`,
    );
  }
  if (
    state !== "active_json" &&
    state !== "prep_pg" &&
    state !== "cutover_pending" &&
    state !== "active_postgres"
  ) {
    throw new RegistryFailFastError(
      `Registry: state inválido em '${domain}': ${String(state)}`,
    );
  }
  if (!isValidSourceState(source, state)) {
    throw new RegistryFailFastError(
      `Registry: source↔state inválido em '${domain}': ${source}/${state}`,
    );
  }
  if (state === "active_postgres") {
    const cutover = e.cutover_at;
    if (cutover === undefined || cutover === null || cutover === "") {
      throw new RegistryFailFastError(
        `Registry: active_postgres exige cutover_at em '${domain}'`,
      );
    }
  }
}

/** Valida mapa completo: domínios conhecidos + source↔state + ops_core homogêneo. */
export function validateRegistryMap(
  input: Record<string, DomainRegistryEntry>,
): RegistryMap {
  for (const key of Object.keys(input)) {
    if (!isOpsDomain(key)) {
      throw new RegistryFailFastError(
        `Registry: domínio desconhecido '${key}'`,
      );
    }
  }

  const map = {} as RegistryMap;
  for (const domain of OPS_DOMAINS) {
    const entry = input[domain];
    if (!entry) {
      throw new RegistryFailFastError(
        `Registry: domínio obrigatório ausente '${domain}'`,
      );
    }
    assertEntry(domain, entry);
    map[domain] = {
      source: entry.source,
      state: entry.state,
      cutover_at: entry.cutover_at ?? null,
      updated_at: entry.updated_at ?? null,
      updated_by: entry.updated_by ?? null,
    };
  }

  assertOpsCoreHomogeneous(map);
  return map;
}

export function assertOpsCoreHomogeneous(map: RegistryMap): void {
  const sources = new Set(OPS_CORE_DOMAINS.map((d) => map[d].source));
  if (sources.size !== 1) {
    const detail = OPS_CORE_DOMAINS.map((d) => `${d}=${map[d].source}`).join(
      ", ",
    );
    throw new RegistryFailFastError(
      `Registry: ops_core misto (deve ser all json ou all postgres): ${detail}`,
    );
  }
}

export function parseRegistryJsonObject(
  raw: unknown,
): Record<string, DomainRegistryEntry> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new RegistryFailFastError("Registry: JSON deve ser um objeto");
  }
  const obj = raw as Record<string, unknown>;
  const out: Record<string, DomainRegistryEntry> = {};
  for (const [k, v] of Object.entries(obj)) {
    assertEntry(k, v);
    out[k] = v as DomainRegistryEntry;
  }
  return out;
}

export type LoadRegistryInput = {
  tableExists: boolean;
  tableRows?: Array<{
    domain: string;
    source: string;
    state: string;
    cutover_at?: string | null;
    updated_at?: string | null;
    updated_by?: string | null;
  }>;
  envRegistry?: string | undefined;
  fileContents?: string | undefined;
};

/**
 * Carregamento §3.2.2 / §3.2.4:
 * - com tabela: só tabela; arquivo ignorado; env presente → fail-fast
 * - sem tabela: arquivo/env all-json; sem criar nada
 */
export function loadRegistry(input: LoadRegistryInput): RegistrySnapshot {
  if (input.tableExists) {
    if (
      input.envRegistry !== undefined &&
      String(input.envRegistry).trim() !== ""
    ) {
      throw new RegistryFailFastError(
        "Registry fail-fast: CORTELY_OPS_REGISTRY definido enquanto ops_domain_registry existe",
      );
    }
    if (!input.tableRows || input.tableRows.length === 0) {
      throw new RegistryFailFastError(
        "Registry: tabela existe mas nenhuma linha fornecida",
      );
    }
    const raw: Record<string, DomainRegistryEntry> = {};
    for (const row of input.tableRows) {
      raw[row.domain] = {
        source: row.source as OpsSource,
        state: row.state as OpsRegistryState,
        cutover_at: row.cutover_at,
        updated_at: row.updated_at,
        updated_by: row.updated_by,
      };
    }
    const map = validateRegistryMap(raw);
    return {
      map,
      fingerprint: fingerprintRegistryMap(map),
      loadedFrom: "table",
    };
  }

  const fromEnv =
    input.envRegistry !== undefined && String(input.envRegistry).trim() !== "";
  const text = fromEnv ? String(input.envRegistry) : input.fileContents;
  if (text === undefined || text.trim() === "") {
    throw new RegistryFailFastError(
      "Registry: sem tabela e sem arquivo/env all-json",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new RegistryFailFastError("Registry: JSON inválido em arquivo/env");
  }
  const raw = parseRegistryJsonObject(parsed);
  const map = validateRegistryMap(raw);
  for (const d of OPS_DOMAINS) {
    if (map[d].source === "postgres" || map[d].state === "active_postgres") {
      throw new RegistryFailFastError(
        `Registry: arquivo/env não podem promover '${d}' para postgres/active_postgres`,
      );
    }
  }
  return {
    map,
    fingerprint: fingerprintRegistryMap(map),
    loadedFrom: fromEnv ? "env" : "file",
  };
}

/** Snapshot canônico all-json embutido no bundle (resolveJsonModule). */
export function bundledRegistrySeedObject(): Record<
  string,
  DomainRegistryEntry
> {
  return opsRegistrySeed as Record<string, DomainRegistryEntry>;
}

/** Texto JSON do seed embutido — default de readSeedFile no boot. */
export function bundledRegistrySeedText(): string {
  return JSON.stringify(opsRegistrySeed);
}

export function sourceOf(
  snapshot: RegistrySnapshot,
  domain: OpsDomain,
): OpsSource {
  return snapshot.map[domain].source;
}

/** True quando há URL + service role para consultar a tabela. */
export function canQueryRegistryViaServiceRole(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(
    env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

export type RegistryTableRow = {
  domain: string;
  source: string;
  state: string;
  cutover_at?: string | null;
  updated_at?: string | null;
  updated_by?: string | null;
};

export type FetchRegistryTableResult =
  | { ok: true; rows: RegistryTableRow[] }
  | { ok: false; kind: "relation_missing" }
  | { ok: false; kind: "error"; message: string };

export type ResolveRegistryBootDeps = {
  env?: NodeJS.ProcessEnv;
  readSeedFile?: () => string;
  fetchTable?: () => Promise<FetchRegistryTableResult>;
  log?: (msg: string) => void;
};

let cachedSnapshot: RegistrySnapshot | null = null;

export function getCachedRegistrySnapshot(): RegistrySnapshot | null {
  return cachedSnapshot;
}

export function clearRegistryBootCache(): void {
  cachedSnapshot = null;
}

/**
 * Tabela inexistente: SOMENTE códigos Postgres/PostgREST canônicos.
 * Mensagens ("does not exist", etc.) sem esses códigos → NÃO são relation_missing.
 */
export function isRelationMissingError(err: unknown): boolean {
  const code = String((err as { code?: string } | null | undefined)?.code || "");
  return code === "42P01" || code === "PGRST205";
}

/** True quando CORTELY_OPS_REGISTRY_REQUIRE_TABLE=true (pós-migration remota). */
export function requireRegistryTable(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return String(env.CORTELY_OPS_REGISTRY_REQUIRE_TABLE || "").trim() === "true";
}

async function defaultFetchRegistryTable(): Promise<FetchRegistryTableResult> {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!.trim();
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client
    .from("ops_domain_registry")
    .select("domain,source,state,cutover_at,updated_at,updated_by");
  if (error) {
    if (isRelationMissingError(error)) {
      return { ok: false, kind: "relation_missing" };
    }
    return {
      ok: false,
      kind: "error",
      message: `${error.code || "ERR"}: ${error.message}`,
    };
  }
  return { ok: true, rows: (data || []) as RegistryTableRow[] };
}

/**
 * Boot real (§3.2.2/§3.2.4):
 * a) sem Supabase (demo/sem service role) → seed embutido (ou CORTELY_OPS_REGISTRY)
 * b) com Supabase → SELECT; só 42P01/PGRST205 → seed (salvo REQUIRE_TABLE=true);
 *    qualquer outro erro → fail-fast (nunca seed por rede/auth/timeout/coluna)
 * c) loadRegistry + cache + log fingerprint/loadedFrom
 */
export async function resolveRegistryAtBoot(
  deps: ResolveRegistryBootDeps = {},
): Promise<RegistrySnapshot> {
  const env = deps.env ?? process.env;
  const log = deps.log ?? ((m: string) => console.info(m));
  const readSeed = deps.readSeedFile ?? bundledRegistrySeedText;

  let snapshot: RegistrySnapshot;

  if (!canQueryRegistryViaServiceRole(env)) {
    snapshot = loadRegistry({
      tableExists: false,
      fileContents: readSeed(),
      envRegistry: env.CORTELY_OPS_REGISTRY,
    });
  } else {
    const fetchTable = deps.fetchTable ?? defaultFetchRegistryTable;
    let result: FetchRegistryTableResult;
    try {
      result = await fetchTable();
    } catch (err) {
      throw new RegistryFailFastError(
        `Registry fail-fast: falha ao consultar ops_domain_registry (${
          err instanceof Error ? err.message : String(err)
        })`,
      );
    }
    if (!result.ok && result.kind === "relation_missing") {
      if (requireRegistryTable(env)) {
        throw new RegistryFailFastError(
          "Registry fail-fast: CORTELY_OPS_REGISTRY_REQUIRE_TABLE=true e ops_domain_registry ausente (42P01/PGRST205)",
        );
      }
      snapshot = loadRegistry({
        tableExists: false,
        fileContents: readSeed(),
        envRegistry: env.CORTELY_OPS_REGISTRY,
      });
    } else if (!result.ok) {
      throw new RegistryFailFastError(
        `Registry fail-fast: erro ao ler ops_domain_registry (${result.message})`,
      );
    } else {
      snapshot = loadRegistry({
        tableExists: true,
        tableRows: result.rows,
        envRegistry: env.CORTELY_OPS_REGISTRY,
      });
    }
  }

  cachedSnapshot = snapshot;
  log(
    `cortely ops-registry boot: loadedFrom=${snapshot.loadedFrom} fingerprint=${snapshot.fingerprint}`,
  );
  return snapshot;
}
