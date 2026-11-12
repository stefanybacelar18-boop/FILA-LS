/**
 * Cortely 1.B.0 — registry global de fontes ops (json | postgres).
 * Carregamento e validação conforme plano §3.2.2 / §3.2.3 / §3.2.4.
 * Sem API de flip nesta etapa — apenas função pura de transição (testada).
 */

import { createHash } from "crypto";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

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
  // postgres → somente active_postgres (autorização 1.B.0)
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
    // prep
    "json:active_json->json:prep_pg",
    // freeze
    "json:prep_pg->json:cutover_pending",
    // abort cutover before flip
    "json:cutover_pending->json:active_json",
    // flip = ponto sem retorno
    "json:cutover_pending->postgres:active_postgres",
  ]);
  return allowed.has(key);
}

export function fingerprintRegistryMap(map: RegistryMap): string {
  const raw = OPS_DOMAINS.map(
    (d) => `${d}:${map[d].source}:${map[d].state}`,
  ).join(",");
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
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
  const sources = new Set(
    OPS_CORE_DOMAINS.map((d) => map[d].source),
  );
  if (sources.size !== 1) {
    const detail = OPS_CORE_DOMAINS.map(
      (d) => `${d}=${map[d].source}`,
    ).join(", ");
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
  /** Se true, carrega só da tabela; arquivo é ignorado. */
  tableExists: boolean;
  tableRows?: Array<{
    domain: string;
    source: string;
    state: string;
    cutover_at?: string | null;
    updated_at?: string | null;
    updated_by?: string | null;
  }>;
  /** Valor de process.env.CORTELY_OPS_REGISTRY (string JSON). */
  envRegistry?: string | undefined;
  /** Conteúdo do arquivo seed (só usado se tableExists=false). */
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
    // arquivo intencionalmente ignorado (não comparado)
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

  // Sem tabela: env ou arquivo; não criar tabela
  const fromEnv =
    input.envRegistry !== undefined && String(input.envRegistry).trim() !== "";
  const text = fromEnv
    ? String(input.envRegistry)
    : input.fileContents;
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
  // Seed file/env nunca devem promover active_postgres
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

export function defaultRegistryFilePath(): string {
  return join(process.cwd(), "config", "ops-registry.json");
}

/** Lê o arquivo seed do disco (não cria nada). */
export function readRegistrySeedFile(
  path: string = defaultRegistryFilePath(),
): string {
  if (!existsSync(path)) {
    throw new RegistryFailFastError(
      `Registry: arquivo seed ausente em ${path}`,
    );
  }
  return readFileSync(path, "utf8");
}

export function sourceOf(
  snapshot: RegistrySnapshot,
  domain: OpsDomain,
): OpsSource {
  return snapshot.map[domain].source;
}
