/**
 * Cortely 1.B.0 — fachada OpsRepository.
 * Com ops_core=json delega ao opsStore atual sem mudar comportamento.
 * Qualquer domínio postgres nesta etapa → erro explícito (adapters PG ainda não existem).
 * Código novo usa barbershop_id da sessão — sem SHOP_ID neste módulo.
 */

import { opsStore } from "./ops-store";
import {
  OPS_CORE_DOMAINS,
  OPS_DOMAINS,
  type OpsDomain,
  type RegistrySnapshot,
  sourceOf,
} from "./ops-registry";

export class OpsRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpsRepositoryError";
  }
}

export type OpsRepositoryOptions = {
  registry: RegistrySnapshot;
  /** Tenant da sessão — obrigatório em código novo (D8). */
  sessionBarbershopId: string;
};

export class OpsRepository {
  readonly sessionBarbershopId: string;
  private readonly registry: RegistrySnapshot;

  constructor(opts: OpsRepositoryOptions) {
    if (!opts.sessionBarbershopId || !opts.sessionBarbershopId.trim()) {
      throw new OpsRepositoryError(
        "OpsRepository: sessionBarbershopId da sessão é obrigatório",
      );
    }
    this.sessionBarbershopId = opts.sessionBarbershopId;
    this.registry = opts.registry;
  }

  source(domain: OpsDomain) {
    return sourceOf(this.registry, domain);
  }

  /** Garante que o domínio ainda é json (1.B.0 — sem adapters PG). */
  requireJson(domain: OpsDomain): void {
    if (this.source(domain) === "postgres") {
      throw new OpsRepositoryError(
        `OpsRepository: domínio '${domain}' está em postgres, mas adapters PG ainda não existem na 1.B.0`,
      );
    }
  }

  /** Antes de delegar ao opsStore, todos os domínios conhecidos devem ser json. */
  private assertAllJsonForDelegation(): void {
    for (const domain of OPS_DOMAINS) {
      this.requireJson(domain);
    }
  }

  /** ops_core homogêneo json (fail-fast de uso). */
  assertOpsCoreJson(): void {
    for (const domain of OPS_CORE_DOMAINS) {
      this.requireJson(domain);
    }
  }

  /**
   * Acesso ao opsStore legado — só quando registry all-json.
   * Não altera comportamento do store; apenas bloqueia se houver postgres.
   */
  get jsonStore(): typeof opsStore {
    this.assertAllJsonForDelegation();
    return opsStore;
  }
}

export function createOpsRepository(
  opts: OpsRepositoryOptions,
): OpsRepository {
  return new OpsRepository(opts);
}
