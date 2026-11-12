/**
 * Cortely 1.B.0/1.B.1/1.B.2 — fachada OpsRepository.
 * Com ops_core=json delega ao opsStore atual sem mudar comportamento.
 * 1.B.1: ProductsStockRepository JSON (prod) ou PG (só se registry=postgres).
 * 1.B.2: CashRepository JSON (prod) ou PG (só se cash=postgres — impossível em prod).
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
import {
  createJsonCashRepository,
  createPgCashRepository,
  type CashRepository,
} from "./cash-repository";
import {
  createJsonProductsStockRepository,
  createPgProductsStockRepository,
  type PgQueryable,
  type ProductsStockRepository,
} from "./products-stock-repository";

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
  /** Cliente PG opcional — só usado se products/stock/cash estiverem em postgres. */
  pg?: PgQueryable;
};

export class OpsRepository {
  readonly sessionBarbershopId: string;
  private readonly registry: RegistrySnapshot;
  private readonly pg: PgQueryable | undefined;

  constructor(opts: OpsRepositoryOptions) {
    if (!opts.sessionBarbershopId || !opts.sessionBarbershopId.trim()) {
      throw new OpsRepositoryError(
        "OpsRepository: sessionBarbershopId da sessão é obrigatório",
      );
    }
    this.sessionBarbershopId = opts.sessionBarbershopId;
    this.registry = opts.registry;
    this.pg = opts.pg;
  }

  source(domain: OpsDomain) {
    return sourceOf(this.registry, domain);
  }

  /** Garante que o domínio ainda é json (sem adapters PG em produção 1.B.1). */
  requireJson(domain: OpsDomain): void {
    if (this.source(domain) === "postgres") {
      throw new OpsRepositoryError(
        `OpsRepository: domínio '${domain}' está em postgres`,
      );
    }
  }

  private assertAllJsonForDelegation(): void {
    for (const domain of OPS_DOMAINS) {
      this.requireJson(domain);
    }
  }

  assertOpsCoreJson(): void {
    for (const domain of OPS_CORE_DOMAINS) {
      this.requireJson(domain);
    }
  }

  /**
   * Acesso ao opsStore legado — só quando registry all-json.
   * Passagem direta para rotas (1.B.1) sem mudar comportamento.
   */
  get jsonStore(): typeof opsStore {
    this.assertAllJsonForDelegation();
    return opsStore;
  }

  /**
   * Adapter products/stock.
   * PG só se registry estiver em postgres (impossível em prod nesta etapa).
   */
  productsStock(): ProductsStockRepository {
    const productsPg = this.source("products") === "postgres";
    const stockPg = this.source("stock") === "postgres";
    if (productsPg || stockPg) {
      if (productsPg !== stockPg) {
        throw new OpsRepositoryError(
          "OpsRepository: products e stock devem estar na mesma fonte",
        );
      }
      if (!this.pg) {
        throw new OpsRepositoryError(
          "OpsRepository: adapter PG exige cliente Postgres",
        );
      }
      return createPgProductsStockRepository(this.pg, this.sessionBarbershopId);
    }
    return createJsonProductsStockRepository(
      opsStore,
      this.sessionBarbershopId,
    );
  }

  /**
   * Adapter caixa.
   * PG só se cash=postgres (impossível em prod nesta etapa — prep only).
   */
  cash(): CashRepository {
    if (this.source("cash") === "postgres") {
      if (!this.pg) {
        throw new OpsRepositoryError(
          "OpsRepository: adapter PG de caixa exige cliente Postgres",
        );
      }
      return createPgCashRepository(this.pg, this.sessionBarbershopId);
    }
    return createJsonCashRepository(opsStore, this.sessionBarbershopId);
  }
}

export function createOpsRepository(
  opts: OpsRepositoryOptions,
): OpsRepository {
  return new OpsRepository(opts);
}
