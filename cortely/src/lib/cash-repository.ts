/**
 * Cortely 1.B.2 — adapter caixa (cash_sessions / cash_movements).
 * JSON: delega ao opsStore (comportamento inalterado; sem troco).
 * PG: ops_open_cash / ops_add_cash_movement / ops_cash_conference / ops_close_cash.
 * Tenant sempre da sessão.
 */
import type { CashMovement, CashSession } from "./types-ops";
import { opsStore } from "./ops-store";
import type { PgQueryable } from "./products-stock-repository";

type OpsStore = typeof opsStore;

export class CashError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "CashError";
    this.status = status;
    this.code = code;
  }
}

export type OpenCashInput = {
  opened_by: string;
  opening_amount: number;
  notes?: string;
};

export type CloseCashInput = {
  closed_by: string;
  closing_amount: number;
  counted_by_method?: Record<string, number>;
};

export type AddCashMovementInput = {
  type: "sangria" | "suprimento";
  amount: number;
  reason: string;
  created_by: string;
};

export type CashConferenceResult = {
  session_id: string;
  opening_amount: number;
  expected_cash: number;
  by_method: Record<string, number>;
  status?: string;
  ledger_in?: number;
  ledger_out?: number;
  movements?: CashMovement[];
};

export interface CashRepository {
  openCash(input: OpenCashInput): Promise<CashSession>;
  closeCash(input: CloseCashInput): Promise<CashSession>;
  cashConference(sessionId?: string): Promise<CashConferenceResult>;
  currentCash(): Promise<CashSession | null>;
  addCashMovement(input: AddCashMovementInput): Promise<CashMovement>;
}

function mapManualTypeToKind(
  type: "sangria" | "suprimento",
): "manual_in" | "manual_out" {
  return type === "suprimento" ? "manual_in" : "manual_out";
}

function kindToLegacyType(kind: string): "sangria" | "suprimento" {
  if (kind === "manual_in") return "suprimento";
  if (kind === "manual_out") return "sangria";
  // Movimentos de venda/troco não existem no JSON; mapeamento só para manuais.
  return kind.includes("out") ? "sangria" : "suprimento";
}

function mapPgError(err: unknown): never {
  const e = err as { code?: string; message?: string };
  const code = String(e?.code || "");
  const msg = String(e?.message || err);
  if (code === "PT409" || /CASH_ALREADY_OPEN|CASH_NOT_OPEN|CASH_ALREADY_CLOSED/.test(msg)) {
    if (/CASH_ALREADY_OPEN/.test(msg)) {
      throw new CashError(409, "CASH_ALREADY_OPEN", "Já existe um caixa aberto");
    }
    if (/CASH_ALREADY_CLOSED/.test(msg)) {
      throw new CashError(409, "CASH_ALREADY_CLOSED", "Caixa já fechado");
    }
    throw new CashError(409, "CASH_NOT_OPEN", "Nenhum caixa aberto");
  }
  if (code === "PT404" || /CASH_NOT_FOUND/.test(msg)) {
    throw new CashError(404, "CASH_NOT_FOUND", "Caixa não encontrado");
  }
  throw err instanceof Error ? err : new Error(msg);
}

function rowToSession(r: Record<string, unknown>): CashSession {
  return {
    id: String(r.session_id ?? r.id),
    barbershop_id: String(r.barbershop_id),
    opened_by: String(r.opened_by ?? ""),
    closed_by: r.closed_by == null ? null : String(r.closed_by),
    opening_amount: Number(r.opening_amount),
    closing_amount:
      r.closing_amount == null ? null : Number(r.closing_amount),
    expected_cash:
      r.expected_cash == null ? null : Number(r.expected_cash),
    difference: r.difference == null ? null : Number(r.difference),
    status: String(r.status) as "open" | "closed",
    opened_at: new Date(String(r.opened_at ?? new Date().toISOString())).toISOString(),
    closed_at:
      r.closed_at == null
        ? null
        : new Date(String(r.closed_at)).toISOString(),
    notes: r.notes == null ? null : String(r.notes),
  };
}

/** JSON — passagem direta ao opsStore; barbershop_id da sessão só é registrado. */
export function createJsonCashRepository(
  store: OpsStore,
  sessionBarbershopId: string,
): CashRepository {
  if (!sessionBarbershopId?.trim()) {
    throw new CashError(400, "SESSION_REQUIRED", "sessionBarbershopId obrigatório");
  }
  return {
    openCash: async (input) => {
      try {
        return store.openCash(input);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/já existe um caixa aberto/i.test(msg)) {
          throw new CashError(409, "CASH_ALREADY_OPEN", msg);
        }
        throw e;
      }
    },
    closeCash: async (input) => {
      try {
        return store.closeCash(input);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/nenhum caixa aberto/i.test(msg)) {
          throw new CashError(409, "CASH_NOT_OPEN", msg);
        }
        throw e;
      }
    },
    cashConference: async (sessionId) => {
      try {
        const conf = store.cashConference(sessionId);
        return {
          session_id: conf.session_id,
          opening_amount: conf.opening_amount,
          expected_cash: conf.expected_cash,
          by_method: conf.by_method,
          movements: conf.movements,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/não encontrado/i.test(msg)) {
          throw new CashError(404, "CASH_NOT_FOUND", msg);
        }
        throw e;
      }
    },
    currentCash: async () => store.currentCash(),
    addCashMovement: async (input) => {
      try {
        return store.addCashMovement(input);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/abra o caixa/i.test(msg)) {
          throw new CashError(409, "CASH_NOT_OPEN", msg);
        }
        throw e;
      }
    },
  };
}

/** PG — sempre filtra pelo barbershop_id da sessão. */
export function createPgCashRepository(
  db: PgQueryable,
  sessionBarbershopId: string,
): CashRepository {
  if (!sessionBarbershopId?.trim()) {
    throw new CashError(400, "SESSION_REQUIRED", "sessionBarbershopId obrigatório");
  }
  const shop = sessionBarbershopId;

  return {
    async openCash(input) {
      try {
        const res = await db.query(
          `SELECT * FROM public.ops_open_cash($1, $2, $3, $4)`,
          [shop, input.opened_by, input.opening_amount, input.notes ?? null],
        );
        const row = res.rows[0];
        if (!row) throw new CashError(500, "OPEN_FAILED", "ops_open_cash sem retorno");
        return rowToSession(row);
      } catch (e) {
        mapPgError(e);
      }
    },

    async closeCash(input) {
      try {
        const res = await db.query(
          `SELECT * FROM public.ops_close_cash($1, $2, $3)`,
          [shop, input.closed_by, input.closing_amount],
        );
        const row = res.rows[0];
        if (!row) throw new CashError(500, "CLOSE_FAILED", "ops_close_cash sem retorno");
        return rowToSession({
          ...row,
          opened_by: "",
          opened_at: row.closed_at,
          notes: null,
        });
      } catch (e) {
        mapPgError(e);
      }
    },

    async cashConference(sessionId) {
      try {
        const res = await db.query(
          `SELECT * FROM public.ops_cash_conference($1, $2)`,
          [shop, sessionId ?? null],
        );
        const row = res.rows[0];
        if (!row) throw new CashError(404, "CASH_NOT_FOUND", "Caixa não encontrado");
        const by =
          row.by_method && typeof row.by_method === "object"
            ? (row.by_method as Record<string, number>)
            : {};
        const normalized: Record<string, number> = {};
        for (const [k, v] of Object.entries(by)) {
          normalized[k] = Number(v);
        }
        return {
          session_id: String(row.session_id),
          opening_amount: Number(row.opening_amount),
          expected_cash: Number(row.expected_cash),
          by_method: normalized,
          status: row.status == null ? undefined : String(row.status),
          ledger_in: row.ledger_in == null ? undefined : Number(row.ledger_in),
          ledger_out:
            row.ledger_out == null ? undefined : Number(row.ledger_out),
        };
      } catch (e) {
        mapPgError(e);
      }
    },

    async currentCash() {
      const res = await db.query(
        `SELECT id, barbershop_id, opened_by, closed_by, opening_amount,
                closing_amount, expected_cash, difference, status,
                opened_at, closed_at, notes
         FROM public.cash_sessions
         WHERE barbershop_id = $1 AND status = 'open'
         LIMIT 1`,
        [shop],
      );
      const row = res.rows[0];
      if (!row) return null;
      return rowToSession({ ...row, session_id: row.id });
    },

    async addCashMovement(input) {
      try {
        const kind = mapManualTypeToKind(input.type);
        const res = await db.query(
          `SELECT * FROM public.ops_add_cash_movement($1, $2, $3, $4, $5)`,
          [shop, kind, input.amount, input.reason, input.created_by],
        );
        const row = res.rows[0];
        if (!row) {
          throw new CashError(500, "MOVEMENT_FAILED", "ops_add_cash_movement sem retorno");
        }
        const movement: CashMovement = {
          id: String(row.movement_id),
          cash_session_id: String(row.cash_session_id),
          barbershop_id: String(row.barbershop_id),
          type: kindToLegacyType(String(row.kind)),
          amount: Number(row.amount),
          reason: String(row.reason),
          created_by: String(row.created_by),
          created_at: new Date(String(row.created_at)).toISOString(),
        };
        return movement;
      } catch (e) {
        mapPgError(e);
      }
    },
  };
}
