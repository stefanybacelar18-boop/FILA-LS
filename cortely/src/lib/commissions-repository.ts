/**
 * Cortely 1.B.4 — adapter comissões / vales / ranking.
 * JSON: opsStore (comportamento inalterado).
 * PG: ops_accrue / reverse / clawback / pay / ranking; tenant da sessão.
 */
import type {
  BarberGoal,
  CommissionEntry,
  CommissionRule,
  StaffAdvance,
} from "./types-ops";
import { opsStore } from "./ops-store";
import type { PgQueryable } from "./products-stock-repository";

type OpsStore = typeof opsStore;

export class CommissionsError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "CommissionsError";
    this.status = status;
    this.code = code;
  }
}

export type PayCommissionsResult = {
  count: number;
  total: number;
  advances_deducted: number;
  payout_id?: string | null;
  gross?: number;
  net?: number;
};

export type RankingRow = {
  barber_id: string;
  revenue: number;
  services: number;
  commission: number;
  goal: BarberGoal | null;
};

export interface CommissionsRepository {
  setCommissionRule(input: {
    barber_id?: string | null;
    service_percent: number;
    product_percent: number;
  }): Promise<CommissionRule>;
  listRules(): Promise<CommissionRule[]>;
  accrueForSale(saleId: string): Promise<CommissionEntry[]>;
  reversePending(saleId: string): Promise<{ count: number }>;
  clawback(entryId: string, actor: string): Promise<{ clawback_id: string }>;
  payCommissions(barberId: string, actor: string): Promise<PayCommissionsResult>;
  createStaffAdvance(input: {
    barber_id: string;
    amount: number;
    reason: string;
  }): Promise<StaffAdvance>;
  listStaffAdvances(): Promise<StaffAdvance[]>;
  ranking(month?: string): Promise<RankingRow[]>;
  upsertGoal(input: {
    barber_id: string;
    month: string;
    revenue_target: number;
    services_target: number;
  }): Promise<BarberGoal>;
}

function mapPgError(err: unknown): never {
  const e = err as { code?: string; message?: string };
  const code = String(e?.code || "");
  const msg = String(e?.message || err);
  if (code === "PT404" || /NOT_FOUND/.test(msg)) {
    throw new CommissionsError(404, "NOT_FOUND", msg);
  }
  if (code === "PT409" || /CLAWBACK|ALREADY/.test(msg)) {
    throw new CommissionsError(409, "CONFLICT", msg);
  }
  throw err instanceof Error ? err : new Error(msg);
}

export function createJsonCommissionsRepository(
  store: OpsStore,
  sessionBarbershopId: string,
): CommissionsRepository {
  if (!sessionBarbershopId?.trim()) {
    throw new CommissionsError(400, "SESSION_REQUIRED", "sessionBarbershopId obrigatório");
  }
  return {
    setCommissionRule: async (input) => store.setCommissionRule(input),
    listRules: async () => store.snapshot().commissionRules.map((r) => ({ ...r })),
    accrueForSale: async (saleId) => {
      const snap = store.snapshot();
      const sale = snap.sales.find((s) => s.id === saleId);
      if (!sale?.barber_id) return [];
      const items = snap.saleItems.filter((i) => i.sale_id === saleId);
      const entry = store.accrueCommission({
        barber_id: sale.barber_id,
        sale_id: saleId,
        items: items.map((i) => ({
          kind: i.kind,
          unit_price: i.unit_price,
          quantity: i.quantity,
        })),
      });
      return entry ? [entry] : [];
    },
    reversePending: async () => {
      // JSON legado zera amount no refund — não há reverse separado; no-op
      return { count: 0 };
    },
    clawback: async () => {
      throw new CommissionsError(
        501,
        "NOT_IN_JSON",
        "clawback só disponível no adapter PG",
      );
    },
    payCommissions: async (barberId, actor) => store.payCommissions(barberId, actor),
    createStaffAdvance: async (input) => store.createStaffAdvance(input),
    listStaffAdvances: async () => store.listStaffAdvances(),
    ranking: async (month) => store.ranking(month),
    upsertGoal: async (input) => store.upsertGoal(input),
  };
}

export function createPgCommissionsRepository(
  db: PgQueryable,
  sessionBarbershopId: string,
): CommissionsRepository {
  if (!sessionBarbershopId?.trim()) {
    throw new CommissionsError(400, "SESSION_REQUIRED", "sessionBarbershopId obrigatório");
  }
  const shop = sessionBarbershopId;

  return {
    async setCommissionRule(input) {
      const res = await db.query(
        `INSERT INTO public.commission_rules (
           barbershop_id, barber_id, service_id, service_percent, product_percent
         ) VALUES ($1,$2,NULL,$3,$4)
         ON CONFLICT (barbershop_id, barber_id, service_id)
         DO UPDATE SET
           service_percent = EXCLUDED.service_percent,
           product_percent = EXCLUDED.product_percent
         RETURNING *`,
        [shop, input.barber_id ?? null, input.service_percent, input.product_percent],
      );
      const r = res.rows[0];
      return {
        id: String(r.id),
        barbershop_id: String(r.barbershop_id),
        barber_id: r.barber_id == null ? null : String(r.barber_id),
        service_id: r.service_id == null ? null : String(r.service_id),
        service_percent: Number(r.service_percent),
        product_percent: Number(r.product_percent),
      };
    },

    async listRules() {
      const res = await db.query(
        `SELECT * FROM public.commission_rules WHERE barbershop_id = $1`,
        [shop],
      );
      return res.rows.map((r) => ({
        id: String(r.id),
        barbershop_id: String(r.barbershop_id),
        barber_id: r.barber_id == null ? null : String(r.barber_id),
        service_id: r.service_id == null ? null : String(r.service_id),
        service_percent: Number(r.service_percent),
        product_percent: Number(r.product_percent),
      }));
    },

    async accrueForSale(saleId) {
      try {
        const res = await db.query(
          `SELECT * FROM public.ops_accrue_commission($1, $2)`,
          [shop, saleId],
        );
        return res.rows.map((r) => ({
          id: String(r.entry_id),
          barbershop_id: shop,
          barber_id: "",
          sale_id: saleId,
          amount: Number(r.amount),
          basis: Number(r.basis),
          percent: Number(r.percent),
          status: "pending" as const,
          created_at: new Date().toISOString(),
          paid_at: null,
        }));
      } catch (e) {
        mapPgError(e);
      }
    },

    async reversePending(saleId) {
      try {
        const res = await db.query(
          `SELECT * FROM public.ops_reverse_pending_commissions($1, $2)`,
          [shop, saleId],
        );
        return { count: res.rows.length };
      } catch (e) {
        mapPgError(e);
      }
    },

    async clawback(entryId, actor) {
      try {
        const res = await db.query(
          `SELECT * FROM public.ops_clawback_commission($1, $2, $3)`,
          [shop, entryId, actor],
        );
        const row = res.rows[0];
        if (!row) throw new CommissionsError(404, "NOT_FOUND", "entry");
        return { clawback_id: String(row.clawback_id) };
      } catch (e) {
        mapPgError(e);
      }
    },

    async payCommissions(barberId, actor) {
      try {
        const res = await db.query(
          `SELECT * FROM public.ops_pay_commissions($1, $2, $3)`,
          [shop, barberId, actor],
        );
        const row = res.rows[0];
        return {
          count: Number(row?.count ?? 0),
          total: Number(row?.net ?? 0),
          advances_deducted: Number(row?.advances_deducted ?? 0),
          payout_id: row?.payout_id == null ? null : String(row.payout_id),
          gross: Number(row?.gross ?? 0),
          net: Number(row?.net ?? 0),
        };
      } catch (e) {
        mapPgError(e);
      }
    },

    async createStaffAdvance(input) {
      const res = await db.query(
        `INSERT INTO public.staff_advances (
           barbershop_id, barber_id, amount, reason, status
         ) VALUES ($1,$2,$3,$4,'open')
         RETURNING *`,
        [shop, input.barber_id, input.amount, input.reason.slice(0, 120)],
      );
      const r = res.rows[0];
      return {
        id: String(r.id),
        barbershop_id: String(r.barbershop_id),
        barber_id: String(r.barber_id),
        amount: Number(r.amount),
        reason: String(r.reason),
        status: "open",
        created_at: new Date(String(r.created_at)).toISOString(),
        deducted_at: null,
      };
    },

    async listStaffAdvances() {
      const res = await db.query(
        `SELECT * FROM public.staff_advances WHERE barbershop_id = $1 ORDER BY created_at DESC`,
        [shop],
      );
      return res.rows.map((r) => ({
        id: String(r.id),
        barbershop_id: String(r.barbershop_id),
        barber_id: String(r.barber_id),
        amount: Number(r.amount),
        reason: String(r.reason),
        status:
          r.status === "deducted"
            ? ("deducted" as const)
            : ("open" as const),
        created_at: new Date(String(r.created_at)).toISOString(),
        deducted_at:
          r.deducted_at == null
            ? null
            : new Date(String(r.deducted_at)).toISOString(),
      }));
    },

    async ranking(month) {
      const res = await db.query(
        `SELECT * FROM public.ops_barber_ranking($1, $2)`,
        [shop, month ?? null],
      );
      return res.rows.map((r) => ({
        barber_id: String(r.barber_id),
        revenue: Number(r.revenue),
        services: Number(r.services),
        commission: Number(r.commission),
        goal:
          r.revenue_target == null
            ? null
            : {
                id: "",
                barbershop_id: shop,
                barber_id: String(r.barber_id),
                month: month ?? new Date().toISOString().slice(0, 7),
                revenue_target: Number(r.revenue_target),
                services_target: Number(r.services_target),
              },
      }));
    },

    async upsertGoal(input) {
      const res = await db.query(
        `INSERT INTO public.barber_goals (
           barbershop_id, barber_id, month, revenue_target, services_target
         ) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (barbershop_id, barber_id, month)
         DO UPDATE SET
           revenue_target = EXCLUDED.revenue_target,
           services_target = EXCLUDED.services_target
         RETURNING *`,
        [
          shop,
          input.barber_id,
          input.month,
          input.revenue_target,
          input.services_target,
        ],
      );
      const r = res.rows[0];
      return {
        id: String(r.id),
        barbershop_id: String(r.barbershop_id),
        barber_id: String(r.barber_id),
        month: String(r.month),
        revenue_target: Number(r.revenue_target),
        services_target: Number(r.services_target),
      };
    },
  };
}
