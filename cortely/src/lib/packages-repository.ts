/**
 * Cortely 1.B.5 — adapter pacotes / assinaturas.
 * JSON: opsStore (comportamento inalterado — P25/P26/P27).
 * PG: ops_sell/consume/revert/cancel; tenant da sessão.
 */
import type {
  ClientPackage,
  ClientSubscription,
  ServicePackage,
  SubscriptionPlan,
} from "./types-ops";
import { opsStore } from "./ops-store";
import type { PgQueryable } from "./products-stock-repository";

type OpsStore = typeof opsStore;

export class PackagesError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "PackagesError";
    this.status = status;
    this.code = code;
  }
}

export type SellPackageResult = {
  client_package: ClientPackage;
};

export type ConsumeResult = {
  consumption_id: string;
  client_package: ClientPackage;
};

export interface PackagesRepository {
  listPackages(): Promise<ServicePackage[]>;
  upsertPackage(
    input: Partial<ServicePackage> & {
      name: string;
      price: number;
      credits: number;
    },
  ): Promise<ServicePackage>;
  /** PG: exige sale_id paid com item package. JSON: ignora sale_id (P25). */
  sellPackage(input: {
    client_id: string;
    package_id: string;
    created_by: string;
    sale_id?: string;
  }): Promise<ClientPackage>;
  listClientPackages(): Promise<ClientPackage[]>;
  consumeCredit(input: {
    client_package_id: string;
    appointment_id?: string | null;
    actor: string;
  }): Promise<ConsumeResult>;
  revertConsumption(input: {
    consumption_id: string;
    actor: string;
  }): Promise<{ credits_left: number; status: string }>;
  cancelClientPackage(input: {
    client_package_id: string;
    actor: string;
  }): Promise<{ status: string }>;
  listSubscriptionPlans(): Promise<SubscriptionPlan[]>;
  subscribeClient(input: {
    client_id: string;
    plan_id: string;
  }): Promise<ClientSubscription>;
}

function mapPgError(err: unknown): never {
  const e = err as { code?: string; message?: string };
  const code = String(e?.code || "");
  const msg = String(e?.message || err);
  if (code === "PT404" || /NOT_FOUND/.test(msg)) {
    throw new PackagesError(404, "NOT_FOUND", msg);
  }
  if (
    code === "PT409" ||
    /EXPIRED|NO_CREDITS|CANCELED|MISSING|NOT_PAID|HAS_ACTIVE|ALREADY|MISMATCH|QUANTITY/.test(
      msg,
    )
  ) {
    throw new PackagesError(409, "CONFLICT", msg);
  }
  throw err instanceof Error ? err : new Error(msg);
}

function mapClientPackageRow(r: Record<string, unknown>): ClientPackage {
  const total = Number(r.credits_total);
  const used = Number(r.credits_used ?? 0);
  return {
    id: String(r.id),
    barbershop_id: String(r.barbershop_id),
    client_id: String(r.client_id),
    package_id: String(r.package_id),
    credits_total: total,
    credits_left: total - used,
    expires_at: new Date(String(r.expires_at)).toISOString(),
    status: String(r.status) as ClientPackage["status"],
    purchased_at: new Date(String(r.purchased_at)).toISOString(),
  };
}

export function createJsonPackagesRepository(
  store: OpsStore,
  sessionBarbershopId: string,
): PackagesRepository {
  if (!sessionBarbershopId?.trim()) {
    throw new PackagesError(400, "SESSION_REQUIRED", "sessionBarbershopId obrigatório");
  }
  return {
    listPackages: async () => store.listPackages(),
    upsertPackage: async (input) => store.upsertPackage(input),
    sellPackage: async (input) =>
      store.sellPackageToClient({
        client_id: input.client_id,
        package_id: input.package_id,
        created_by: input.created_by,
      }),
    listClientPackages: async () =>
      store.snapshot().clientPackages.map((p) => ({ ...p })),
    consumeCredit: async (input) => {
      const row = store.consumePackageCredit(input.client_package_id);
      return { consumption_id: "", client_package: row };
    },
    revertConsumption: async () => {
      throw new PackagesError(501, "NOT_IN_JSON", "revert só no adapter PG");
    },
    cancelClientPackage: async () => {
      throw new PackagesError(501, "NOT_IN_JSON", "cancel só no adapter PG");
    },
    listSubscriptionPlans: async () => store.listSubscriptionPlans(),
    subscribeClient: async (input) => store.subscribeClient(input),
  };
}

export function createPgPackagesRepository(
  db: PgQueryable,
  sessionBarbershopId: string,
): PackagesRepository {
  if (!sessionBarbershopId?.trim()) {
    throw new PackagesError(400, "SESSION_REQUIRED", "sessionBarbershopId obrigatório");
  }
  const shop = sessionBarbershopId;

  return {
    async listPackages() {
      const res = await db.query(
        `SELECT * FROM public.service_packages WHERE barbershop_id = $1 ORDER BY name`,
        [shop],
      );
      return res.rows.map((r) => ({
        id: String(r.id),
        barbershop_id: String(r.barbershop_id),
        name: String(r.name),
        description: r.description == null ? null : String(r.description),
        price: Number(r.price),
        credits: Number(r.credits),
        valid_days: Number(r.valid_days),
        service_ids: Array.isArray(r.service_ids)
          ? (r.service_ids as string[]).map(String)
          : [],
        is_active: Boolean(r.is_active),
      }));
    },

    async upsertPackage(input) {
      if (input.id) {
        const res = await db.query(
          `UPDATE public.service_packages SET
             name = $3, description = $4, price = $5, credits = $6,
             valid_days = COALESCE($7, valid_days),
             service_ids = COALESCE($8::uuid[], service_ids),
             is_active = COALESCE($9, is_active)
           WHERE id = $1 AND barbershop_id = $2
           RETURNING *`,
          [
            input.id,
            shop,
            input.name,
            input.description ?? null,
            input.price,
            input.credits,
            input.valid_days ?? null,
            input.service_ids ?? null,
            input.is_active ?? null,
          ],
        );
        if (!res.rows[0]) throw new PackagesError(404, "NOT_FOUND", "package");
        const r = res.rows[0];
        return {
          id: String(r.id),
          barbershop_id: String(r.barbershop_id),
          name: String(r.name),
          description: r.description == null ? null : String(r.description),
          price: Number(r.price),
          credits: Number(r.credits),
          valid_days: Number(r.valid_days),
          service_ids: Array.isArray(r.service_ids)
            ? (r.service_ids as string[]).map(String)
            : [],
          is_active: Boolean(r.is_active),
        };
      }
      const res = await db.query(
        `INSERT INTO public.service_packages (
           barbershop_id, name, description, price, credits, valid_days, service_ids
         ) VALUES ($1,$2,$3,$4,$5,COALESCE($6,90),COALESCE($7::uuid[],'{}'))
         RETURNING *`,
        [
          shop,
          input.name,
          input.description ?? null,
          input.price,
          input.credits,
          input.valid_days ?? null,
          input.service_ids ?? null,
        ],
      );
      const r = res.rows[0];
      // Sync junction se service_ids
      if (input.service_ids?.length) {
        for (const sid of input.service_ids) {
          await db.query(
            `INSERT INTO public.service_package_services (package_id, service_id, barbershop_id)
             VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
            [r.id, sid, shop],
          );
        }
      }
      return {
        id: String(r.id),
        barbershop_id: String(r.barbershop_id),
        name: String(r.name),
        description: r.description == null ? null : String(r.description),
        price: Number(r.price),
        credits: Number(r.credits),
        valid_days: Number(r.valid_days),
        service_ids: Array.isArray(r.service_ids)
          ? (r.service_ids as string[]).map(String)
          : [],
        is_active: Boolean(r.is_active),
      };
    },

    async sellPackage(input) {
      if (!input.sale_id) {
        throw new PackagesError(400, "SALE_REQUIRED", "sale_id obrigatório no PG");
      }
      try {
        const res = await db.query(
          `SELECT * FROM public.ops_sell_package($1,$2,$3,$4,$5)`,
          [shop, input.client_id, input.package_id, input.sale_id, input.created_by],
        );
        const row = res.rows[0];
        if (!row) throw new PackagesError(500, "EMPTY", "sell");
        const full = await db.query(
          `SELECT * FROM public.client_packages WHERE id = $1 AND barbershop_id = $2`,
          [row.client_package_id, shop],
        );
        return mapClientPackageRow(full.rows[0] as Record<string, unknown>);
      } catch (e) {
        mapPgError(e);
      }
    },

    async listClientPackages() {
      const res = await db.query(
        `SELECT * FROM public.client_packages WHERE barbershop_id = $1 ORDER BY purchased_at DESC`,
        [shop],
      );
      return res.rows.map((r) => mapClientPackageRow(r as Record<string, unknown>));
    },

    async consumeCredit(input) {
      try {
        const res = await db.query(
          `SELECT * FROM public.ops_consume_package_credit($1,$2,$3,$4)`,
          [
            shop,
            input.client_package_id,
            input.appointment_id ?? null,
            input.actor,
          ],
        );
        const row = res.rows[0];
        const full = await db.query(
          `SELECT * FROM public.client_packages WHERE id = $1 AND barbershop_id = $2`,
          [input.client_package_id, shop],
        );
        const mapped = mapClientPackageRow(full.rows[0] as Record<string, unknown>);
        // Expirado: função persiste status e retorna consumption_id NULL (sem RAISE)
        if (row.consumption_id == null && String(row.status) === "expired") {
          throw new PackagesError(409, "PACKAGE_EXPIRED", "PACKAGE_EXPIRED");
        }
        return {
          consumption_id: String(row.consumption_id),
          client_package: mapped,
        };
      } catch (e) {
        if (e instanceof PackagesError) throw e;
        mapPgError(e);
      }
    },

    async revertConsumption(input) {
      try {
        const res = await db.query(
          `SELECT * FROM public.ops_revert_package_consumption($1,$2,$3)`,
          [shop, input.consumption_id, input.actor],
        );
        const row = res.rows[0];
        return {
          credits_left: Number(row.credits_left),
          status: String(row.status),
        };
      } catch (e) {
        mapPgError(e);
      }
    },

    async cancelClientPackage(input) {
      try {
        const res = await db.query(
          `SELECT * FROM public.ops_cancel_client_package($1,$2,$3)`,
          [shop, input.client_package_id, input.actor],
        );
        return { status: String(res.rows[0].status) };
      } catch (e) {
        mapPgError(e);
      }
    },

    async listSubscriptionPlans() {
      const res = await db.query(
        `SELECT * FROM public.subscription_plans WHERE barbershop_id = $1`,
        [shop],
      );
      return res.rows.map((r) => ({
        id: String(r.id),
        barbershop_id: String(r.barbershop_id),
        name: String(r.name),
        price_monthly: Number(r.price_monthly),
        credits_per_month: Number(r.credits_per_month),
        is_active: Boolean(r.is_active),
      }));
    },

    async subscribeClient(input) {
      const res = await db.query(
        `INSERT INTO public.client_subscriptions (
           barbershop_id, client_id, plan_id, status, next_billing_at
         ) VALUES ($1,$2,$3,'active', now() + interval '1 month')
         RETURNING *`,
        [shop, input.client_id, input.plan_id],
      );
      const r = res.rows[0];
      return {
        id: String(r.id),
        barbershop_id: String(r.barbershop_id),
        client_id: String(r.client_id),
        plan_id: String(r.plan_id),
        status: String(r.status) as ClientSubscription["status"],
        started_at: new Date(String(r.started_at)).toISOString(),
        next_billing_at: new Date(String(r.next_billing_at)).toISOString(),
      };
    },
  };
}
