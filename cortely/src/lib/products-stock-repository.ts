/**
 * Cortely 1.B.1 — adapter único products/stock/inventory.
 * JSON: delega ao opsStore (comportamento inalterado).
 * PG: funções ops_adjust_stock / ops_register_inventory_count; tenant da sessão.
 */
import type { InventoryCount, Product, StockMovement } from "./types-ops";
import { opsStore } from "./ops-store";

type OpsStore = typeof opsStore;

export class ProductsStockError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ProductsStockError";
    this.status = status;
    this.code = code;
  }
}

export type UpsertProductInput = Partial<Product> & {
  name: string;
  price: number;
  cost: number;
};

export type AdjustStockInput = {
  product_id: string;
  delta: number;
  reason: string;
};

export type InventoryCountInput = {
  product_id: string;
  counted_qty: number;
  counted_by: string;
};

export type AdjustStockResult = {
  product: Product;
  movement: StockMovement;
};

export interface ProductsStockRepository {
  listProducts(): Promise<Product[]>;
  upsertProduct(input: UpsertProductInput): Promise<Product>;
  adjustStock(input: AdjustStockInput): Promise<AdjustStockResult>;
  inventoryCount(input: InventoryCountInput): Promise<InventoryCount>;
  lowStock(): Promise<Product[]>;
}

/** JSON — passagem direta ao opsStore; barbershop_id da sessão só é registrado. */
export function createJsonProductsStockRepository(
  store: OpsStore,
  sessionBarbershopId: string,
): ProductsStockRepository {
  if (!sessionBarbershopId?.trim()) {
    throw new ProductsStockError(
      400,
      "SESSION_REQUIRED",
      "sessionBarbershopId obrigatório",
    );
  }
  return {
    listProducts: async () => store.listProducts(),
    upsertProduct: async (input) => store.upsertProduct(input),
    adjustStock: async (input) => {
      try {
        return store.adjustStock(input);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/não encontrado/i.test(msg)) {
          throw new ProductsStockError(404, "PRODUCT_NOT_FOUND", msg);
        }
        throw e;
      }
    },
    inventoryCount: async (input) => {
      try {
        return store.inventoryCount(input);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/não encontrado/i.test(msg)) {
          throw new ProductsStockError(404, "PRODUCT_NOT_FOUND", msg);
        }
        throw e;
      }
    },
    lowStock: async () => store.lowStock(),
  };
}

export type PgQueryResult<T = Record<string, unknown>> = {
  rows: T[];
  rowCount: number | null;
};

export type PgQueryable = {
  query: <T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ) => Promise<PgQueryResult<T>>;
};

function mapPgError(err: unknown): never {
  const e = err as { code?: string; message?: string; hint?: string };
  const code = String(e?.code || "");
  const msg = String(e?.message || err);
  if (code === "PT404" || /PRODUCT_NOT_FOUND/.test(msg)) {
    throw new ProductsStockError(404, "PRODUCT_NOT_FOUND", "Produto não encontrado");
  }
  if (code === "PT409" || /INSUFFICIENT_STOCK/.test(msg)) {
    throw new ProductsStockError(409, "INSUFFICIENT_STOCK", "Estoque insuficiente");
  }
  throw err instanceof Error ? err : new Error(msg);
}

function rowToProduct(r: Record<string, unknown>): Product {
  return {
    id: String(r.id),
    barbershop_id: String(r.barbershop_id),
    name: String(r.name),
    sku: (r.sku as string | null) ?? null,
    barcode: (r.barcode as string | null | undefined) ?? null,
    brand: (r.brand as string | null | undefined) ?? null,
    category: String(r.category ?? "Geral"),
    price: Number(r.price),
    cost: Number(r.cost),
    stock_qty: Number(r.stock_qty),
    min_stock: Number(r.min_stock),
    max_stock: r.max_stock == null ? undefined : Number(r.max_stock),
    supplier_id: (r.supplier_id as string | null) ?? null,
    is_active: Boolean(r.is_active),
    created_at: new Date(String(r.created_at)).toISOString(),
  };
}

/** PG — sempre filtra pelo barbershop_id da sessão. */
export function createPgProductsStockRepository(
  db: PgQueryable,
  sessionBarbershopId: string,
): ProductsStockRepository {
  if (!sessionBarbershopId?.trim()) {
    throw new ProductsStockError(
      400,
      "SESSION_REQUIRED",
      "sessionBarbershopId obrigatório",
    );
  }
  const shop = sessionBarbershopId;

  return {
    async listProducts() {
      const res = await db.query(
        `SELECT id, barbershop_id, name, sku, barcode, brand, category,
                price, cost, stock_qty, min_stock, max_stock, supplier_id,
                is_active, created_at
         FROM public.products
         WHERE barbershop_id = $1
         ORDER BY name`,
        [shop],
      );
      return res.rows.map(rowToProduct);
    },

    async upsertProduct(input) {
      if (input.id) {
        const res = await db.query(
          `UPDATE public.products SET
             name = $3,
             sku = COALESCE($4, sku),
             category = COALESCE($5, category),
             price = $6,
             cost = $7,
             min_stock = COALESCE($8, min_stock),
             supplier_id = COALESCE($9, supplier_id),
             is_active = COALESCE($10, is_active)
           WHERE id = $1 AND barbershop_id = $2
           RETURNING id, barbershop_id, name, sku, barcode, brand, category,
                     price, cost, stock_qty, min_stock, max_stock, supplier_id,
                     is_active, created_at`,
          [
            input.id,
            shop,
            input.name,
            input.sku ?? null,
            input.category ?? null,
            input.price,
            input.cost,
            input.min_stock ?? null,
            input.supplier_id ?? null,
            input.is_active ?? null,
          ],
        );
        if (!res.rows[0]) {
          throw new ProductsStockError(404, "PRODUCT_NOT_FOUND", "Produto não encontrado");
        }
        return rowToProduct(res.rows[0]);
      }
      const res = await db.query(
        `INSERT INTO public.products (
           barbershop_id, name, sku, category, price, cost, stock_qty,
           min_stock, supplier_id, is_active
         ) VALUES ($1,$2,$3,COALESCE($4,'Geral'),$5,$6,COALESCE($7,0),COALESCE($8,3),$9,COALESCE($10,TRUE))
         RETURNING id, barbershop_id, name, sku, barcode, brand, category,
                   price, cost, stock_qty, min_stock, max_stock, supplier_id,
                   is_active, created_at`,
        [
          shop,
          input.name,
          input.sku ?? null,
          input.category ?? null,
          input.price,
          input.cost,
          input.stock_qty ?? null,
          input.min_stock ?? null,
          input.supplier_id ?? null,
          input.is_active ?? null,
        ],
      );
      return rowToProduct(res.rows[0]);
    },

    async adjustStock(input) {
      let adj;
      try {
        adj = await db.query(
          `SELECT * FROM public.ops_adjust_stock($1,$2,$3,$4)`,
          [shop, input.product_id, input.delta, input.reason],
        );
      } catch (err) {
        mapPgError(err);
      }
      const row = adj!.rows[0];
      if (!row) {
        throw new ProductsStockError(500, "ADJUST_FAILED", "Ajuste sem retorno");
      }
      const prodRes = await db.query(
        `SELECT id, barbershop_id, name, sku, barcode, brand, category,
                price, cost, stock_qty, min_stock, max_stock, supplier_id,
                is_active, created_at
         FROM public.products WHERE id = $1 AND barbershop_id = $2`,
        [input.product_id, shop],
      );
      const product = rowToProduct(prodRes.rows[0]);
      const movement: StockMovement = {
        id: String(row.movement_id),
        barbershop_id: shop,
        product_id: input.product_id,
        delta: Number(row.delta),
        reason: String(row.reason),
        created_at: new Date(String(row.created_at)).toISOString(),
      };
      return { product, movement };
    },

    async inventoryCount(input) {
      let res;
      try {
        res = await db.query(
          `SELECT * FROM public.ops_register_inventory_count($1,$2,$3,$4)`,
          [shop, input.product_id, input.counted_qty, input.counted_by],
        );
      } catch (err) {
        mapPgError(err);
      }
      const row = res!.rows[0];
      if (!row) {
        throw new ProductsStockError(500, "COUNT_FAILED", "Contagem sem retorno");
      }
      const count: InventoryCount = {
        id: String(row.count_id),
        barbershop_id: shop,
        product_id: String(row.product_id),
        system_qty: Number(row.system_qty),
        counted_qty: Number(row.counted_qty),
        difference: Number(row.difference),
        counted_by: String(row.counted_by),
        created_at: new Date(String(row.created_at)).toISOString(),
      };
      return count;
    },

    async lowStock() {
      const res = await db.query(
        `SELECT id, barbershop_id, name, sku, barcode, brand, category,
                price, cost, stock_qty, min_stock, max_stock, supplier_id,
                is_active, created_at
         FROM public.products
         WHERE barbershop_id = $1
           AND is_active = TRUE
           AND stock_qty <= min_stock
         ORDER BY name`,
        [shop],
      );
      return res.rows.map(rowToProduct);
    },
  };
}
