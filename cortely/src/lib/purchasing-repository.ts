/**
 * Cortely 1.B.6 — adapters purchasing + payables.
 * JSON = opsStore (P29–P31 inalterados). PG = ops_* ; tenant da sessão.
 */
import type { Payable, PurchaseOrder, PurchaseOrderItem } from "./types-ops";
import { opsStore } from "./ops-store";
import type { PgQueryable } from "./products-stock-repository";

type OpsStore = typeof opsStore;

export class PurchasingError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "PurchasingError";
    this.status = status;
    this.code = code;
  }
}

function mapPgError(err: unknown): never {
  const e = err as { code?: string; message?: string };
  const code = String(e?.code || "");
  const msg = String(e?.message || err);
  if (code === "PT404" || /NOT_FOUND/.test(msg)) {
    throw new PurchasingError(404, "NOT_FOUND", msg);
  }
  if (code === "PT409" || /ALREADY|CANCELED|NOT_OPEN|FROM_PO|INVALID|REQUIRED/.test(msg)) {
    throw new PurchasingError(409, "CONFLICT", msg);
  }
  throw err instanceof Error ? err : new Error(msg);
}

export interface PurchasingRepository {
  createPurchaseOrder(input: {
    supplier_id: string;
    items: PurchaseOrderItem[];
    notes?: string | null;
    created_by: string;
  }): Promise<PurchaseOrder>;
  receivePurchaseOrder(
    id: string,
    actor: string,
  ): Promise<{ order: PurchaseOrder; payable_id: string | null }>;
  cancelPurchaseOrder(id: string, actor: string): Promise<PurchaseOrder>;
  listPurchaseOrders(): Promise<PurchaseOrder[]>;
}

export interface PayablesRepository {
  upsertPayable(
    input: Partial<Payable> & {
      description: string;
      amount: number;
      due_date: string;
    },
  ): Promise<Payable>;
  payPayable(id: string, actor: string): Promise<Payable>;
  cancelPayable(id: string, actor: string): Promise<Payable>;
  listPayables(): Promise<Payable[]>;
}

export function createJsonPurchasingRepository(
  store: OpsStore,
  sessionBarbershopId: string,
): PurchasingRepository {
  if (!sessionBarbershopId?.trim()) {
    throw new PurchasingError(400, "SESSION_REQUIRED", "sessionBarbershopId");
  }
  return {
    createPurchaseOrder: async (input) =>
      store.createPurchaseOrder({
        supplier_id: input.supplier_id,
        items: input.items,
        notes: input.notes ?? undefined,
      }),
    receivePurchaseOrder: async (id, actor) => {
      const order = store.receivePurchaseOrder(id, actor);
      return { order, payable_id: null };
    },
    cancelPurchaseOrder: async () => {
      throw new PurchasingError(501, "NOT_IN_JSON", "cancel PO só no PG");
    },
    listPurchaseOrders: async () =>
      store.snapshot().purchaseOrders.map((o) => ({ ...o })),
  };
}

export function createJsonPayablesRepository(
  store: OpsStore,
  sessionBarbershopId: string,
): PayablesRepository {
  if (!sessionBarbershopId?.trim()) {
    throw new PurchasingError(400, "SESSION_REQUIRED", "sessionBarbershopId");
  }
  return {
    upsertPayable: async (input) => store.upsertPayable(input),
    payPayable: async (id) => store.payPayable(id),
    cancelPayable: async () => {
      throw new PurchasingError(501, "NOT_IN_JSON", "cancel payable só no PG");
    },
    listPayables: async () => store.snapshot().payables.map((p) => ({ ...p })),
  };
}

export function createPgPurchasingRepository(
  db: PgQueryable,
  sessionBarbershopId: string,
): PurchasingRepository {
  const shop = sessionBarbershopId;
  if (!shop?.trim()) throw new PurchasingError(400, "SESSION_REQUIRED", "session");

  async function loadOrder(id: string): Promise<PurchaseOrder> {
    const po = await db.query(`SELECT * FROM public.purchase_orders WHERE id=$1 AND barbershop_id=$2`, [
      id,
      shop,
    ]);
    const r = po.rows[0];
    if (!r) throw new PurchasingError(404, "NOT_FOUND", "po");
    const items = await db.query(
      `SELECT product_id, quantity, unit_cost FROM public.purchase_order_items
       WHERE purchase_order_id=$1 AND barbershop_id=$2`,
      [id, shop],
    );
    return {
      id: String(r.id),
      barbershop_id: shop,
      supplier_id: String(r.supplier_id),
      status: String(r.status) as PurchaseOrder["status"],
      items: items.rows.map((i) => ({
        product_id: String(i.product_id),
        quantity: Number(i.quantity),
        unit_cost: Number(i.unit_cost),
      })),
      notes: r.notes == null ? null : String(r.notes),
      total_cost: Number(r.total_cost),
      created_at: new Date(String(r.created_at)).toISOString(),
      received_at: r.received_at == null ? null : new Date(String(r.received_at)).toISOString(),
    };
  }

  return {
    async createPurchaseOrder(input) {
      try {
        const itemsJson = JSON.stringify(
          input.items.map((i) => ({
            product_id: i.product_id,
            quantity: i.quantity,
            unit_cost: i.unit_cost,
          })),
        );
        const res = await db.query(
          `SELECT * FROM public.ops_create_purchase_order($1,$2,$3::jsonb,$4,$5)`,
          [shop, input.supplier_id, itemsJson, input.notes ?? null, input.created_by],
        );
        return loadOrder(String(res.rows[0].purchase_order_id));
      } catch (e) {
        mapPgError(e);
      }
    },
    async receivePurchaseOrder(id, actor) {
      try {
        const res = await db.query(
          `SELECT * FROM public.ops_receive_purchase_order($1,$2,$3)`,
          [shop, id, actor],
        );
        const order = await loadOrder(String(res.rows[0].purchase_order_id));
        return {
          order,
          payable_id: res.rows[0].payable_id == null ? null : String(res.rows[0].payable_id),
        };
      } catch (e) {
        mapPgError(e);
      }
    },
    async cancelPurchaseOrder(id, actor) {
      try {
        await db.query(`SELECT * FROM public.ops_cancel_purchase_order($1,$2,$3)`, [
          shop,
          id,
          actor,
        ]);
        return loadOrder(id);
      } catch (e) {
        mapPgError(e);
      }
    },
    async listPurchaseOrders() {
      const res = await db.query(
        `SELECT id FROM public.purchase_orders WHERE barbershop_id=$1 ORDER BY created_at DESC`,
        [shop],
      );
      const out: PurchaseOrder[] = [];
      for (const row of res.rows) out.push(await loadOrder(String(row.id)));
      return out;
    },
  };
}

export function createPgPayablesRepository(
  db: PgQueryable,
  sessionBarbershopId: string,
): PayablesRepository {
  const shop = sessionBarbershopId;
  if (!shop?.trim()) throw new PurchasingError(400, "SESSION_REQUIRED", "session");

  function mapRow(r: Record<string, unknown>): Payable {
    return {
      id: String(r.id),
      barbershop_id: shop,
      description: String(r.description),
      amount: Number(r.amount),
      due_date: String(r.due_date).slice(0, 10),
      category: String(r.category ?? "Variável"),
      status: String(r.status) as Payable["status"],
      paid_at: r.paid_at == null ? null : new Date(String(r.paid_at)).toISOString(),
    };
  }

  return {
    async upsertPayable(input) {
      try {
        const res = await db.query(
          `SELECT * FROM public.ops_upsert_payable($1,$2,$3,$4,$5::date,$6,$7)`,
          [
            shop,
            input.id ?? null,
            input.description,
            input.amount,
            input.due_date,
            input.category ?? null,
            "actor",
          ],
        );
        const full = await db.query(
          `SELECT * FROM public.payables WHERE id=$1 AND barbershop_id=$2`,
          [res.rows[0].payable_id, shop],
        );
        return mapRow(full.rows[0] as Record<string, unknown>);
      } catch (e) {
        mapPgError(e);
      }
    },
    async payPayable(id, actor) {
      try {
        await db.query(`SELECT * FROM public.ops_pay_payable($1,$2,$3)`, [shop, id, actor]);
        const full = await db.query(
          `SELECT * FROM public.payables WHERE id=$1 AND barbershop_id=$2`,
          [id, shop],
        );
        return mapRow(full.rows[0] as Record<string, unknown>);
      } catch (e) {
        mapPgError(e);
      }
    },
    async cancelPayable(id, actor) {
      try {
        await db.query(`SELECT * FROM public.ops_cancel_payable($1,$2,$3)`, [shop, id, actor]);
        const full = await db.query(
          `SELECT * FROM public.payables WHERE id=$1 AND barbershop_id=$2`,
          [id, shop],
        );
        return mapRow(full.rows[0] as Record<string, unknown>);
      } catch (e) {
        mapPgError(e);
      }
    },
    async listPayables() {
      const res = await db.query(
        `SELECT * FROM public.payables WHERE barbershop_id=$1 ORDER BY due_date`,
        [shop],
      );
      return res.rows.map((r) => mapRow(r as Record<string, unknown>));
    },
  };
}
