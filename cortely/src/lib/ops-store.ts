import { randomUUID } from "crypto";
import type {
  AppointmentDeposit,
  BarberGoal,
  Campaign,
  CashMovement,
  CashSession,
  ClientPackage,
  ClientSubscription,
  CommissionEntry,
  CommissionRule,
  Coupon,
  FiscalDocument,
  InventoryCount,
  OpsSnapshot,
  Payable,
  PaymentMethod,
  Product,
  Receivable,
  PurchaseOrder,
  Review,
  Sale,
  SaleItem,
  SalePayment,
  ServicePackage,
  ShopUnit,
  StaffAdvance,
  StockMovement,
  Supplier,
  WaitlistEntry,
} from "@/lib/types-ops";
import { loadPersistedStore, persistOps } from "@/lib/persist";
import { getWhatsAppDeliveryMode, sendWhatsAppMessage } from "@/lib/whatsapp";

const SHOP_ID = "11111111-1111-4111-8111-111111111111";

const globalOps = globalThis as typeof globalThis & {
  __cortelyOpsV2?: OpsSnapshot;
};

function seed(): OpsSnapshot {
  const supplierId = "55555555-5555-4555-8555-555555555551";
  const productPomada: Product = {
    id: "66666666-6666-4666-8666-666666666661",
    barbershop_id: SHOP_ID,
    name: "Pomada Modeladora",
    sku: "POM-01",
    category: "Finalização",
    price: 45,
    cost: 22,
    stock_qty: 18,
    min_stock: 5,
    supplier_id: supplierId,
    is_active: true,
    created_at: new Date().toISOString(),
  };
  const productShampoo: Product = {
    id: "66666666-6666-4666-8666-666666666662",
    barbershop_id: SHOP_ID,
    name: "Shampoo Barber",
    sku: "SHA-01",
    category: "Cabelo",
    price: 39,
    cost: 18,
    stock_qty: 3,
    min_stock: 5,
    supplier_id: supplierId,
    is_active: true,
    created_at: new Date().toISOString(),
  };
  const pkgId = "77777777-7777-4777-8777-777777777771";
  const planId = "88888888-8888-4888-8888-888888888881";

  return {
    products: [productPomada, productShampoo],
    suppliers: [
      {
        id: supplierId,
        barbershop_id: SHOP_ID,
        name: "Distribuidora Navalha",
        phone: "11988887777",
        email: "compras@navalha.sup",
        notes: "Entrega terça/quinta",
      },
    ],
    stockMovements: [],
    inventoryCounts: [],
    cashSessions: [],
    cashMovements: [],
    sales: [],
    saleItems: [],
    salePayments: [],
    commissionRules: [
      {
        id: randomUUID(),
        barbershop_id: SHOP_ID,
        barber_id: null,
        service_id: null,
        service_percent: 40,
        product_percent: 15,
      },
    ],
    commissionEntries: [],
    staffAdvances: [],
    goals: [
      {
        id: randomUUID(),
        barbershop_id: SHOP_ID,
        barber_id: "22222222-2222-4222-8222-222222222221",
        month: new Date().toISOString().slice(0, 7),
        revenue_target: 8000,
        services_target: 80,
      },
    ],
    packages: [
      {
        id: pkgId,
        barbershop_id: SHOP_ID,
        name: "Pacote 5 Cortes",
        description: "5 créditos de corte clássico",
        price: 220,
        credits: 5,
        valid_days: 90,
        service_ids: ["33333333-3333-4333-8333-333333333331"],
        is_active: true,
      },
    ],
    clientPackages: [],
    subscriptionPlans: [
      {
        id: planId,
        barbershop_id: SHOP_ID,
        name: "Clube Cortely Mensal",
        price_monthly: 149,
        credits_per_month: 4,
        is_active: true,
      },
    ],
    clientSubscriptions: [],
    waitlist: [],
    payables: [
      {
        id: randomUUID(),
        barbershop_id: SHOP_ID,
        description: "Aluguel",
        amount: 3500,
        due_date: new Date().toISOString().slice(0, 10),
        category: "Fixo",
        status: "open",
        paid_at: null,
      },
    ],
    receivables: [],
    campaigns: [],
    coupons: [
      {
        id: randomUUID(),
        barbershop_id: SHOP_ID,
        code: "CORTELY10",
        percent_off: 10,
        max_uses: 50,
        used_count: 0,
        expires_at: null,
        is_active: true,
      },
    ],
    reviews: [],
    deposits: [],
    purchaseOrders: [],
    units: [
      {
        id: SHOP_ID,
        name: "Navalha Negra — Augusta",
        slug: "navalha-negra",
        city: "São Paulo",
        is_hq: true,
      },
      {
        id: "99999999-9999-4999-8999-999999999991",
        name: "Navalha Negra — Moema",
        slug: "navalha-moema",
        city: "São Paulo",
        is_hq: false,
      },
    ],
    auditLog: [],
    fiscalDocuments: [],
  };
}

function state(): OpsSnapshot {
  if (!globalOps.__cortelyOpsV2) {
    const saved = loadPersistedStore().ops as OpsSnapshot | undefined;
    if (saved && !saved.purchaseOrders) saved.purchaseOrders = [];
    if (saved && !saved.staffAdvances) saved.staffAdvances = [];
    if (saved && !saved.inventoryCounts) saved.inventoryCounts = [];
    if (saved && !saved.fiscalDocuments) saved.fiscalDocuments = [];
    globalOps.__cortelyOpsV2 = saved ?? seed();
    if (!saved) persistOps(globalOps.__cortelyOpsV2);
  }
  return globalOps.__cortelyOpsV2;
}

function sessionCashExpected(sessionId: string) {
  const s = state();
  const session = s.cashSessions.find((c) => c.id === sessionId);
  if (!session) return { expected: 0, byMethod: {} as Record<string, number> };
  const saleIds = new Set(
    s.sales
      .filter((x) => x.cash_session_id === sessionId && x.status === "paid")
      .map((x) => x.id),
  );
  const byMethod: Record<string, number> = {};
  let cashIn = 0;
  for (const pay of s.salePayments) {
    if (!saleIds.has(pay.sale_id)) continue;
    byMethod[pay.method] = (byMethod[pay.method] ?? 0) + pay.amount;
    if (pay.method === "cash") cashIn += pay.amount;
  }
  const movements = s.cashMovements.filter((m) => m.cash_session_id === sessionId);
  const sangria = movements
    .filter((m) => m.type === "sangria")
    .reduce((a, m) => a + m.amount, 0);
  const suprimento = movements
    .filter((m) => m.type === "suprimento")
    .reduce((a, m) => a + m.amount, 0);
  const expected = session.opening_amount + cashIn + suprimento - sangria;
  return { expected, byMethod };
}

function commit() {
  persistOps(state());
}

function audit(actor: string, action: string, detail: string) {
  state().auditLog.unshift({
    id: randomUUID(),
    barbershop_id: SHOP_ID,
    actor,
    action,
    detail,
    created_at: new Date().toISOString(),
  });
  commit();
}

const opsStoreImpl = {
  snapshot() {
    const s = state();
    return JSON.parse(JSON.stringify(s)) as OpsSnapshot;
  },

  // —— Caixa ——
  openCash(input: { opened_by: string; opening_amount: number; notes?: string }) {
    const s = state();
    if (s.cashSessions.some((c) => c.status === "open")) {
      throw new Error("Já existe um caixa aberto");
    }
    const row: CashSession = {
      id: randomUUID(),
      barbershop_id: SHOP_ID,
      opened_by: input.opened_by,
      closed_by: null,
      opening_amount: input.opening_amount,
      closing_amount: null,
      status: "open",
      opened_at: new Date().toISOString(),
      closed_at: null,
      notes: input.notes ?? null,
    };
    s.cashSessions.unshift(row);
    audit(input.opened_by, "cash.open", `Abertura R$ ${input.opening_amount}`);
    return { ...row };
  },

  closeCash(input: {
    closed_by: string;
    closing_amount: number;
    counted_by_method?: Record<string, number>;
  }) {
    const s = state();
    const open = s.cashSessions.find((c) => c.status === "open");
    if (!open) throw new Error("Nenhum caixa aberto");
    const { expected, byMethod } = sessionCashExpected(open.id);
    open.status = "closed";
    open.closed_by = input.closed_by;
    open.closing_amount = input.closing_amount;
    open.expected_cash = Math.round(expected * 100) / 100;
    open.difference =
      Math.round((input.closing_amount - expected) * 100) / 100;
    open.counted_by_method = input.counted_by_method ?? byMethod;
    open.closed_at = new Date().toISOString();
    audit(
      input.closed_by,
      "cash.close",
      `Fechamento R$ ${input.closing_amount} · esperado R$ ${open.expected_cash} · diff R$ ${open.difference}`,
    );
    return { ...open };
  },

  cashConference(sessionId?: string) {
    const open = sessionId
      ? state().cashSessions.find((c) => c.id === sessionId)
      : this.currentCash();
    if (!open) throw new Error("Caixa não encontrado");
    const { expected, byMethod } = sessionCashExpected(open.id);
    return {
      session_id: open.id,
      opening_amount: open.opening_amount,
      expected_cash: Math.round(expected * 100) / 100,
      by_method: byMethod,
      movements: state().cashMovements.filter(
        (m) => m.cash_session_id === open.id,
      ),
    };
  },

  currentCash() {
    return state().cashSessions.find((c) => c.status === "open") ?? null;
  },

  addCashMovement(input: {
    type: "sangria" | "suprimento";
    amount: number;
    reason: string;
    created_by: string;
  }) {
    const open = this.currentCash();
    if (!open) throw new Error("Abra o caixa primeiro");
    const row: CashMovement = {
      id: randomUUID(),
      cash_session_id: open.id,
      barbershop_id: SHOP_ID,
      type: input.type,
      amount: input.amount,
      reason: input.reason,
      created_by: input.created_by,
      created_at: new Date().toISOString(),
    };
    state().cashMovements.unshift(row);
    return { ...row };
  },

  createSale(input: {
    created_by: string;
    client_id?: string | null;
    client_name?: string | null;
    barber_id?: string | null;
    appointment_id?: string | null;
    discount?: number;
    tip?: number;
    coupon_code?: string | null;
    items: Array<{
      kind: "service" | "product" | "package";
      ref_id: string;
      description: string;
      quantity: number;
      unit_price: number;
    }>;
    payments: Array<{ method: PaymentMethod; amount: number }>;
  }) {
    const s = state();
    const open = this.currentCash();
    let discount = input.discount ?? 0;
    const tip = Math.max(0, input.tip ?? 0);
    if (input.coupon_code) {
      const coupon = s.coupons.find(
        (c) =>
          c.code.toUpperCase() === input.coupon_code!.toUpperCase() &&
          c.is_active &&
          c.used_count < c.max_uses,
      );
      if (!coupon) throw new Error("Cupom inválido");
      const sub = input.items.reduce((a, i) => a + i.quantity * i.unit_price, 0);
      discount += (sub * coupon.percent_off) / 100;
      coupon.used_count += 1;
    }

    const subtotal = input.items.reduce(
      (a, i) => a + i.quantity * i.unit_price,
      0,
    );
    const total =
      Math.max(0, Math.round((subtotal - discount + tip) * 100) / 100);
    const payments = input.payments.map((p) => ({ ...p }));
    const paySum = payments.reduce((a, p) => a + p.amount, 0);
    if (payments.length === 1) {
      payments[0].amount = total;
    } else if (Math.abs(paySum - total) > 0.05) {
      throw new Error("Soma dos pagamentos deve fechar o total");
    }

    // Prevenção de cobrança duplicada: mesmo appointment + total nos últimos 2 min
    if (input.appointment_id) {
      const dup = s.sales.find(
        (x) =>
          x.appointment_id === input.appointment_id &&
          x.status === "paid" &&
          Math.abs(x.total - total) < 0.05 &&
          Date.now() - new Date(x.created_at).getTime() < 120_000,
      );
      if (dup) {
        throw new Error("Possível cobrança duplicada deste atendimento");
      }
    }

    const sale: Sale = {
      id: randomUUID(),
      barbershop_id: SHOP_ID,
      cash_session_id: open?.id ?? null,
      client_id: input.client_id ?? null,
      client_name: input.client_name ?? null,
      barber_id: input.barber_id ?? null,
      appointment_id: input.appointment_id ?? null,
      subtotal,
      discount,
      tip,
      total,
      status: "paid",
      created_by: input.created_by,
      created_at: new Date().toISOString(),
      canceled_at: null,
      cancel_reason: null,
    };
    s.sales.unshift(sale);

    for (const item of input.items) {
      const row: SaleItem = {
        id: randomUUID(),
        sale_id: sale.id,
        kind: item.kind,
        ref_id: item.ref_id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total: item.quantity * item.unit_price,
      };
      s.saleItems.push(row);

      if (item.kind === "product") {
        this.adjustStock({
          product_id: item.ref_id,
          delta: -item.quantity,
          reason: `Venda ${sale.id.slice(0, 8)}`,
        });
      }
      if (item.kind === "package") {
        // créditos atribuídos no fluxo de pacote cliente
      }
    }

    for (const pay of payments) {
      const row: SalePayment = {
        id: randomUUID(),
        sale_id: sale.id,
        method: pay.method,
        amount: pay.amount,
      };
      s.salePayments.push(row);
    }

    if (input.barber_id) {
      this.accrueCommission({
        barber_id: input.barber_id,
        sale_id: sale.id,
        items: input.items,
      });
    }

    audit(input.created_by, "sale.create", `Venda ${sale.id} R$ ${total}`);
    return {
      sale: { ...sale },
      items: s.saleItems.filter((i) => i.sale_id === sale.id),
      payments: s.salePayments.filter((p) => p.sale_id === sale.id),
    };
  },

  refundSale(saleId: string, actor: string, reason?: string) {
    const s = state();
    const sale = s.sales.find((x) => x.id === saleId);
    if (!sale) throw new Error("Venda não encontrada");
    if (sale.status !== "paid") throw new Error("Venda não está paga");
    // Soft refund: mantém histórico original, só muda status
    sale.status = "refunded";
    sale.canceled_at = new Date().toISOString();
    sale.cancel_reason = reason ?? "Estorno";
    for (const item of s.saleItems.filter((i) => i.sale_id === saleId)) {
      if (item.kind === "product") {
        this.adjustStock({
          product_id: item.ref_id,
          delta: item.quantity,
          reason: `Estorno ${saleId.slice(0, 8)}`,
        });
      }
    }
    for (const c of s.commissionEntries.filter((e) => e.sale_id === saleId)) {
      c.status = "paid";
      c.amount = 0;
    }
    audit(actor, "sale.refund", `${saleId} · ${sale.cancel_reason}`);
    return { ...sale };
  },

  cancelSale(saleId: string, actor: string, reason: string) {
    const s = state();
    const sale = s.sales.find((x) => x.id === saleId);
    if (!sale) throw new Error("Venda não encontrada");
    if (sale.status !== "paid") throw new Error("Venda não está paga");
    sale.status = "canceled";
    sale.canceled_at = new Date().toISOString();
    sale.cancel_reason = reason;
    for (const item of s.saleItems.filter((i) => i.sale_id === saleId)) {
      if (item.kind === "product") {
        this.adjustStock({
          product_id: item.ref_id,
          delta: item.quantity,
          reason: `Cancelamento ${saleId.slice(0, 8)}`,
        });
      }
    }
    for (const c of s.commissionEntries.filter((e) => e.sale_id === saleId)) {
      c.status = "paid";
      c.amount = 0;
    }
    audit(actor, "sale.cancel", `${saleId} · ${reason}`);
    return { ...sale };
  },

  // —— Estoque ——
  listProducts() {
    return state().products.map((p) => ({ ...p }));
  },

  upsertProduct(input: Partial<Product> & { name: string; price: number; cost: number }) {
    const s = state();
    if (input.id) {
      const row = s.products.find((p) => p.id === input.id);
      if (!row) throw new Error("Produto não encontrado");
      Object.assign(row, {
        name: input.name,
        sku: input.sku ?? row.sku,
        category: input.category ?? row.category,
        price: input.price,
        cost: input.cost,
        min_stock: input.min_stock ?? row.min_stock,
        supplier_id: input.supplier_id ?? row.supplier_id,
        is_active: input.is_active ?? row.is_active,
      });
      return { ...row };
    }
    const row: Product = {
      id: randomUUID(),
      barbershop_id: SHOP_ID,
      name: input.name,
      sku: input.sku ?? null,
      category: input.category ?? "Geral",
      price: input.price,
      cost: input.cost,
      stock_qty: input.stock_qty ?? 0,
      min_stock: input.min_stock ?? 3,
      supplier_id: input.supplier_id ?? null,
      is_active: true,
      created_at: new Date().toISOString(),
    };
    s.products.push(row);
    return { ...row };
  },

  adjustStock(input: { product_id: string; delta: number; reason: string }) {
    const s = state();
    const product = s.products.find((p) => p.id === input.product_id);
    if (!product) throw new Error("Produto não encontrado");
    product.stock_qty += input.delta;
    const mov: StockMovement = {
      id: randomUUID(),
      barbershop_id: SHOP_ID,
      product_id: input.product_id,
      delta: input.delta,
      reason: input.reason,
      created_at: new Date().toISOString(),
    };
    s.stockMovements.unshift(mov);
    return { product: { ...product }, movement: { ...mov } };
  },

  lowStock() {
    return state().products.filter((p) => p.stock_qty <= p.min_stock && p.is_active);
  },

  listSuppliers() {
    return state().suppliers.map((s) => ({ ...s }));
  },

  upsertSupplier(input: Partial<Supplier> & { name: string }) {
    const s = state();
    if (input.id) {
      const row = s.suppliers.find((x) => x.id === input.id);
      if (!row) throw new Error("Fornecedor não encontrado");
      Object.assign(row, input);
      return { ...row };
    }
    const row: Supplier = {
      id: randomUUID(),
      barbershop_id: SHOP_ID,
      name: input.name,
      phone: input.phone ?? null,
      email: input.email ?? null,
      notes: input.notes ?? null,
    };
    s.suppliers.push(row);
    return { ...row };
  },

  listPurchaseOrders() {
    return state().purchaseOrders.map((o) => ({
      ...o,
      items: o.items.map((i) => ({ ...i })),
    }));
  },

  createPurchaseOrder(input: {
    supplier_id: string;
    items: Array<{ product_id: string; quantity: number; unit_cost: number }>;
    notes?: string | null;
  }) {
    const s = state();
    if (!s.suppliers.some((x) => x.id === input.supplier_id)) {
      throw new Error("Fornecedor inválido");
    }
    if (!input.items.length) throw new Error("Adicione itens à ordem");
    for (const item of input.items) {
      if (!s.products.some((p) => p.id === item.product_id)) {
        throw new Error("Produto inválido na ordem");
      }
      if (item.quantity <= 0 || item.unit_cost < 0) {
        throw new Error("Quantidade/custo inválidos");
      }
    }
    const total_cost = input.items.reduce(
      (a, i) => a + i.quantity * i.unit_cost,
      0,
    );
    const row: PurchaseOrder = {
      id: randomUUID(),
      barbershop_id: SHOP_ID,
      supplier_id: input.supplier_id,
      status: "ordered",
      items: input.items.map((i) => ({ ...i })),
      notes: input.notes ?? null,
      total_cost,
      created_at: new Date().toISOString(),
      received_at: null,
    };
    s.purchaseOrders.unshift(row);
    audit("sistema", "purchase.create", row.id);
    commit();
    return { ...row, items: row.items.map((i) => ({ ...i })) };
  },

  receivePurchaseOrder(id: string, actor: string) {
    const s = state();
    const order = s.purchaseOrders.find((o) => o.id === id);
    if (!order) throw new Error("Ordem não encontrada");
    if (order.status === "received") throw new Error("Ordem já recebida");
    if (order.status === "canceled") throw new Error("Ordem cancelada");
    for (const item of order.items) {
      this.adjustStock({
        product_id: item.product_id,
        delta: item.quantity,
        reason: `OC ${order.id.slice(0, 8)} · entrada`,
      });
    }
    order.status = "received";
    order.received_at = new Date().toISOString();
    s.payables.push({
      id: randomUUID(),
      barbershop_id: SHOP_ID,
      description: `Ordem de compra ${order.id.slice(0, 8)}`,
      amount: order.total_cost,
      due_date: new Date().toISOString().slice(0, 10),
      category: "Estoque",
      status: "open",
      paid_at: null,
    });
    audit(actor, "purchase.receive", order.id);
    commit();
    return { ...order, items: order.items.map((i) => ({ ...i })) };
  },

  // —— Comissões ——
  accrueCommission(input: {
    barber_id: string;
    sale_id: string;
    items: Array<{ kind: string; unit_price: number; quantity: number }>;
  }) {
    const s = state();
    const rule =
      s.commissionRules.find((r) => r.barber_id === input.barber_id) ||
      s.commissionRules.find((r) => r.barber_id === null);
    if (!rule) return null;

    let basis = 0;
    let amount = 0;
    for (const item of input.items) {
      const line = item.unit_price * item.quantity;
      basis += line;
      const pct =
        item.kind === "product" ? rule.product_percent : rule.service_percent;
      amount += (line * pct) / 100;
    }
    const avgPct = basis > 0 ? (amount / basis) * 100 : 0;
    const entry: CommissionEntry = {
      id: randomUUID(),
      barbershop_id: SHOP_ID,
      barber_id: input.barber_id,
      sale_id: input.sale_id,
      amount: Math.round(amount * 100) / 100,
      basis,
      percent: Math.round(avgPct * 10) / 10,
      status: "pending",
      created_at: new Date().toISOString(),
      paid_at: null,
    };
    s.commissionEntries.unshift(entry);
    return { ...entry };
  },

  setCommissionRule(input: {
    barber_id?: string | null;
    service_percent: number;
    product_percent: number;
  }) {
    const s = state();
    const existing = s.commissionRules.find(
      (r) => (r.barber_id ?? null) === (input.barber_id ?? null),
    );
    if (existing) {
      existing.service_percent = input.service_percent;
      existing.product_percent = input.product_percent;
      return { ...existing };
    }
    const row: CommissionRule = {
      id: randomUUID(),
      barbershop_id: SHOP_ID,
      barber_id: input.barber_id ?? null,
      service_id: null,
      service_percent: input.service_percent,
      product_percent: input.product_percent,
    };
    s.commissionRules.push(row);
    return { ...row };
  },

  payCommissions(barberId: string, actor: string) {
    const s = state();
    const pending = s.commissionEntries.filter(
      (e) => e.barber_id === barberId && e.status === "pending",
    );
    for (const e of pending) {
      e.status = "paid";
      e.paid_at = new Date().toISOString();
    }
    let total = pending.reduce((a, e) => a + e.amount, 0);
    const advances = s.staffAdvances.filter(
      (a) => a.barber_id === barberId && a.status === "open",
    );
    let deducted = 0;
    for (const adv of advances) {
      deducted += adv.amount;
      adv.status = "deducted";
      adv.deducted_at = new Date().toISOString();
    }
    total = Math.max(0, Math.round((total - deducted) * 100) / 100);
    audit(
      actor,
      "commission.pay",
      `${barberId} bruto comissões − vales = R$ ${total}`,
    );
    return { count: pending.length, total, advances_deducted: deducted };
  },

  createStaffAdvance(input: {
    barber_id: string;
    amount: number;
    reason: string;
  }) {
    if (input.amount <= 0) throw new Error("Valor do vale inválido");
    const row: StaffAdvance = {
      id: randomUUID(),
      barbershop_id: SHOP_ID,
      barber_id: input.barber_id,
      amount: input.amount,
      reason: input.reason.slice(0, 120),
      status: "open",
      created_at: new Date().toISOString(),
      deducted_at: null,
    };
    state().staffAdvances.unshift(row);
    return { ...row };
  },

  listStaffAdvances() {
    return state().staffAdvances.map((a) => ({ ...a }));
  },

  ranking(month?: string) {
    const m = month ?? new Date().toISOString().slice(0, 7);
    const s = state();
    const map = new Map<string, { revenue: number; services: number; commission: number }>();
    for (const sale of s.sales.filter(
      (x) => x.status === "paid" && x.created_at.startsWith(m) && x.barber_id,
    )) {
      const key = sale.barber_id!;
      const cur = map.get(key) ?? { revenue: 0, services: 0, commission: 0 };
      cur.revenue += sale.total;
      cur.services += 1;
      map.set(key, cur);
    }
    for (const c of s.commissionEntries.filter((e) => e.created_at.startsWith(m))) {
      const cur = map.get(c.barber_id) ?? { revenue: 0, services: 0, commission: 0 };
      cur.commission += c.amount;
      map.set(c.barber_id, cur);
    }
    return Array.from(map.entries())
      .map(([barber_id, stats]) => ({
        barber_id,
        ...stats,
        goal: s.goals.find((g) => g.barber_id === barber_id && g.month === m) ?? null,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  },

  upsertGoal(input: {
    barber_id: string;
    month: string;
    revenue_target: number;
    services_target: number;
  }) {
    const s = state();
    const existing = s.goals.find(
      (g) => g.barber_id === input.barber_id && g.month === input.month,
    );
    if (existing) {
      existing.revenue_target = input.revenue_target;
      existing.services_target = input.services_target;
      return { ...existing };
    }
    const row: BarberGoal = {
      id: randomUUID(),
      barbershop_id: SHOP_ID,
      ...input,
    };
    s.goals.push(row);
    return { ...row };
  },

  // —— Pacotes / assinaturas ——
  listPackages() {
    return state().packages.map((p) => ({ ...p }));
  },

  upsertPackage(input: Partial<ServicePackage> & { name: string; price: number; credits: number }) {
    const s = state();
    if (input.id) {
      const row = s.packages.find((p) => p.id === input.id);
      if (!row) throw new Error("Pacote não encontrado");
      Object.assign(row, input);
      return { ...row };
    }
    const row: ServicePackage = {
      id: randomUUID(),
      barbershop_id: SHOP_ID,
      name: input.name,
      description: input.description ?? null,
      price: input.price,
      credits: input.credits,
      valid_days: input.valid_days ?? 90,
      service_ids: input.service_ids ?? [],
      is_active: true,
    };
    s.packages.push(row);
    return { ...row };
  },

  sellPackageToClient(input: {
    client_id: string;
    package_id: string;
    created_by: string;
  }) {
    const s = state();
    const pkg = s.packages.find((p) => p.id === input.package_id && p.is_active);
    if (!pkg) throw new Error("Pacote inválido");
    const expires = new Date();
    expires.setDate(expires.getDate() + pkg.valid_days);
    const row: ClientPackage = {
      id: randomUUID(),
      barbershop_id: SHOP_ID,
      client_id: input.client_id,
      package_id: pkg.id,
      credits_total: pkg.credits,
      credits_left: pkg.credits,
      expires_at: expires.toISOString(),
      status: "active",
      purchased_at: new Date().toISOString(),
    };
    s.clientPackages.push(row);
    this.createSale({
      created_by: input.created_by,
      client_id: input.client_id,
      items: [
        {
          kind: "package",
          ref_id: pkg.id,
          description: pkg.name,
          quantity: 1,
          unit_price: pkg.price,
        },
      ],
      payments: [{ method: "pix", amount: pkg.price }],
    });
    return { ...row };
  },

  consumePackageCredit(clientPackageId: string) {
    const row = state().clientPackages.find((p) => p.id === clientPackageId);
    if (!row || row.status !== "active") throw new Error("Pacote indisponível");
    if (new Date(row.expires_at) < new Date()) {
      row.status = "expired";
      throw new Error("Pacote expirado");
    }
    row.credits_left -= 1;
    if (row.credits_left <= 0) row.status = "depleted";
    return { ...row };
  },

  listSubscriptionPlans() {
    return state().subscriptionPlans.map((p) => ({ ...p }));
  },

  subscribeClient(input: { client_id: string; plan_id: string }) {
    const s = state();
    const plan = s.subscriptionPlans.find((p) => p.id === input.plan_id);
    if (!plan) throw new Error("Plano inválido");
    const next = new Date();
    next.setMonth(next.getMonth() + 1);
    const row: ClientSubscription = {
      id: randomUUID(),
      barbershop_id: SHOP_ID,
      client_id: input.client_id,
      plan_id: plan.id,
      status: "active",
      started_at: new Date().toISOString(),
      next_billing_at: next.toISOString(),
    };
    s.clientSubscriptions.push(row);
    return { ...row };
  },

  // —— Waitlist ——
  addWaitlist(input: {
    client_name: string;
    client_phone: string;
    service_id?: string | null;
    barber_id?: string | null;
    preferred_date?: string | null;
    notes?: string | null;
  }) {
    const row: WaitlistEntry = {
      id: randomUUID(),
      barbershop_id: SHOP_ID,
      client_name: input.client_name,
      client_phone: input.client_phone,
      service_id: input.service_id ?? null,
      barber_id: input.barber_id ?? null,
      preferred_date: input.preferred_date ?? null,
      notes: input.notes ?? null,
      status: "waiting",
      created_at: new Date().toISOString(),
    };
    state().waitlist.unshift(row);
    return { ...row };
  },

  updateWaitlistStatus(id: string, status: WaitlistEntry["status"]) {
    const row = state().waitlist.find((w) => w.id === id);
    if (!row) throw new Error("Lista de espera não encontrada");
    row.status = status;
    return { ...row };
  },

  // —— Financeiro ——
  upsertPayable(input: Partial<Payable> & { description: string; amount: number; due_date: string }) {
    const s = state();
    if (input.id) {
      const row = s.payables.find((p) => p.id === input.id);
      if (!row) throw new Error("Conta não encontrada");
      Object.assign(row, input);
      return { ...row };
    }
    const row: Payable = {
      id: randomUUID(),
      barbershop_id: SHOP_ID,
      description: input.description,
      amount: input.amount,
      due_date: input.due_date,
      category: input.category ?? "Variável",
      status: "open",
      paid_at: null,
    };
    s.payables.push(row);
    return { ...row };
  },

  payPayable(id: string) {
    const row = state().payables.find((p) => p.id === id);
    if (!row) throw new Error("Conta não encontrada");
    row.status = "paid";
    row.paid_at = new Date().toISOString();
    return { ...row };
  },

  upsertReceivable(
    input: Partial<Receivable> & {
      client_name: string;
      amount: number;
      due_date: string;
      description: string;
    },
  ) {
    const s = state();
    const row: Receivable = {
      id: randomUUID(),
      barbershop_id: SHOP_ID,
      client_id: input.client_id ?? null,
      client_name: input.client_name,
      description: input.description,
      amount: input.amount,
      due_date: input.due_date,
      status: "open",
      paid_at: null,
    };
    s.receivables.push(row);
    return { ...row };
  },

  payReceivable(id: string) {
    const row = state().receivables.find((r) => r.id === id);
    if (!row) throw new Error("Recebível não encontrado");
    row.status = "paid";
    row.paid_at = new Date().toISOString();
    return { ...row };
  },

  cashflowSummary() {
    const s = state();
    const paidSales = s.sales.filter((x) => x.status === "paid");
    // Faturamento = vendas registradas (mesmo se fiado/parcial via receivables)
    const billing = paidSales.reduce((a, x) => a + x.total, 0);
    const receivedFromSales = s.salePayments
      .filter((p) => paidSales.some((x) => x.id === p.sale_id))
      .reduce((a, p) => a + p.amount, 0);
    const receivedFromReceivables = s.receivables
      .filter((r) => r.status === "paid")
      .reduce((a, r) => a + r.amount, 0);
    const received = receivedFromSales + receivedFromReceivables;
    const expenses = s.payables
      .filter((p) => p.status === "paid")
      .reduce((a, p) => a + p.amount, 0);
    const openPayables = s.payables
      .filter((p) => p.status === "open")
      .reduce((a, p) => a + p.amount, 0);
    const openReceivables = s.receivables
      .filter((r) => r.status === "open")
      .reduce((a, r) => a + r.amount, 0);
    const cogs = s.saleItems
      .filter((i) => {
        const sale = paidSales.find((x) => x.id === i.sale_id);
        return sale && i.kind === "product";
      })
      .reduce((a, i) => {
        const p = s.products.find((x) => x.id === i.ref_id);
        return a + (p ? p.cost * i.quantity : 0);
      }, 0);
    const grossProfit = billing - cogs;
    const netProfit = grossProfit - expenses;
    const open = this.currentCash();
    const cashBalance = open
      ? sessionCashExpected(open.id).expected
      : s.cashSessions
          .filter((c) => c.status === "closed")
          .reduce((a, c) => a + (c.closing_amount ?? 0), 0);
    return {
      // legado (compat UI)
      gross_revenue: billing,
      cogs,
      expenses,
      net_profit: netProfit,
      open_payables: openPayables,
      open_receivables: openReceivables,
      ticket_avg: paidSales.length > 0 ? billing / paidSales.length : 0,
      // indicadores separados (não misturar)
      billing,
      received,
      cash_balance: Math.round(cashBalance * 100) / 100,
      gross_profit: Math.round(grossProfit * 100) / 100,
      net_profit_strict: Math.round(netProfit * 100) / 100,
      pending_receivables: openReceivables,
    };
  },

  inventoryCount(input: {
    product_id: string;
    counted_qty: number;
    counted_by: string;
  }) {
    const s = state();
    const product = s.products.find((p) => p.id === input.product_id);
    if (!product) throw new Error("Produto não encontrado");
    const difference = input.counted_qty - product.stock_qty;
    const row: InventoryCount = {
      id: randomUUID(),
      barbershop_id: SHOP_ID,
      product_id: product.id,
      system_qty: product.stock_qty,
      counted_qty: input.counted_qty,
      difference,
      counted_by: input.counted_by,
      created_at: new Date().toISOString(),
    };
    s.inventoryCounts.unshift(row);
    if (difference !== 0) {
      this.adjustStock({
        product_id: product.id,
        delta: difference,
        reason: `Inventário ${row.id.slice(0, 8)}`,
      });
    }
    audit(input.counted_by, "inventory.count", `${product.name} Δ${difference}`);
    return { ...row };
  },

  replenishmentSuggestions() {
    return state()
      .products.filter((p) => p.is_active && p.stock_qty <= p.min_stock)
      .map((p) => {
        const max = p.max_stock ?? Math.max(p.min_stock * 3, 20);
        const suggested = Math.max(0, max - p.stock_qty);
        const margin = p.price > 0 ? ((p.price - p.cost) / p.price) * 100 : 0;
        return {
          product_id: p.id,
          name: p.name,
          stock_qty: p.stock_qty,
          min_stock: p.min_stock,
          suggested_qty: suggested,
          estimated_cost: suggested * p.cost,
          margin_percent: Math.round(margin * 10) / 10,
          supplier_id: p.supplier_id,
        };
      })
      .sort((a, b) => a.stock_qty - b.stock_qty);
  },

  profitability() {
    const s = state();
    const paid = new Set(
      s.sales.filter((x) => x.status === "paid").map((x) => x.id),
    );
    const byService: Record<string, { revenue: number; qty: number }> = {};
    const byProduct: Record<
      string,
      { revenue: number; cost: number; qty: number }
    > = {};
    const byBarber: Record<string, { revenue: number; qty: number }> = {};
    for (const item of s.saleItems) {
      if (!paid.has(item.sale_id)) continue;
      if (item.kind === "service") {
        const row = (byService[item.description] ??= { revenue: 0, qty: 0 });
        row.revenue += item.total;
        row.qty += item.quantity;
      }
      if (item.kind === "product") {
        const product = s.products.find((p) => p.id === item.ref_id);
        const row = (byProduct[item.description] ??= {
          revenue: 0,
          cost: 0,
          qty: 0,
        });
        row.revenue += item.total;
        row.cost += (product?.cost ?? 0) * item.quantity;
        row.qty += item.quantity;
      }
    }
    for (const sale of s.sales.filter((x) => x.status === "paid")) {
      if (!sale.barber_id) continue;
      const row = (byBarber[sale.barber_id] ??= { revenue: 0, qty: 0 });
      row.revenue += sale.total;
      row.qty += 1;
    }
    return {
      by_service: Object.entries(byService)
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.revenue - a.revenue),
      by_product: Object.entries(byProduct)
        .map(([name, v]) => ({
          name,
          ...v,
          margin: v.revenue - v.cost,
          margin_percent:
            v.revenue > 0
              ? Math.round(((v.revenue - v.cost) / v.revenue) * 1000) / 10
              : 0,
        }))
        .sort((a, b) => b.margin - a.margin),
      by_barber: Object.entries(byBarber)
        .map(([barber_id, v]) => ({ barber_id, ...v }))
        .sort((a, b) => b.revenue - a.revenue),
    };
  },

  // —— Marketing ——
  createCampaign(input: {
    name: string;
    segment: Campaign["segment"];
    message: string;
  }) {
    const row: Campaign = {
      id: randomUUID(),
      barbershop_id: SHOP_ID,
      name: input.name,
      channel: "whatsapp",
      segment: input.segment,
      message: input.message,
      status: "draft",
      sent_at: null,
      created_at: new Date().toISOString(),
    };
    state().campaigns.unshift(row);
    return { ...row };
  },

  async sendCampaign(id: string, phones: string[] = []) {
    const row = state().campaigns.find((c) => c.id === id);
    if (!row) throw new Error("Campanha não encontrada");
    const mode = getWhatsAppDeliveryMode();
    const deliveries: Array<{ phone: string; ok: boolean; url?: string }> = [];
    for (const phone of phones.slice(0, 50)) {
      const result = await sendWhatsAppMessage({
        toPhone: phone,
        message: row.message,
      });
      deliveries.push({
        phone,
        ok: result.ok,
        url: result.url,
      });
    }
    row.status = "sent";
    row.sent_at = new Date().toISOString();
    audit("marketing", "campaign.send", `${row.name} · ${deliveries.length} destinos · ${mode}`);
    return {
      ...row,
      delivery_mode: mode,
      deliveries,
      sent_count: deliveries.length,
    };
  },

  async offerWaitlistSlot(input: {
    id: string;
    message?: string;
    offered_slot?: string;
  }) {
    const row = state().waitlist.find((w) => w.id === input.id);
    if (!row) throw new Error("Entrada não encontrada");
    if (row.status !== "waiting") throw new Error("Entrada não está em espera");
    const message =
      input.message ||
      `Olá ${row.client_name}! Abriu uma vaga na Cortely${
        input.offered_slot ? ` às ${input.offered_slot}` : ""
      }. Responda rápido para garantir.`;
    const delivery = await sendWhatsAppMessage({
      toPhone: row.client_phone,
      message,
    });
    row.status = "offered";
    audit(
      "waitlist",
      "waitlist.offer",
      `${row.client_name} · ${delivery.mode}`,
    );
    return { entry: { ...row }, delivery };
  },

  draftFiscalDocument(input: {
    sale_id: string;
    doc_type?: FiscalDocument["doc_type"];
    actor: string;
  }) {
    const sale = state().sales.find((s) => s.id === input.sale_id);
    if (!sale) throw new Error("Venda não encontrada");
    const items = state().saleItems.filter((i) => i.sale_id === sale.id);
    const payments = state().salePayments.filter((p) => p.sale_id === sale.id);
    const row: FiscalDocument = {
      id: randomUUID(),
      barbershop_id: SHOP_ID,
      sale_id: sale.id,
      doc_type: input.doc_type ?? "nfc_e",
      status: "draft",
      payload: {
        total: sale.total,
        client_name: sale.client_name,
        items,
        payments,
        note: "Rascunho — emissão SEFAZ ainda não integrada",
      },
      created_at: new Date().toISOString(),
    };
    state().fiscalDocuments.unshift(row);
    audit(input.actor, "fiscal.draft", `${row.doc_type} · venda ${sale.id}`);
    return { ...row };
  },

  upsertCoupon(input: {
    code: string;
    percent_off: number;
    max_uses?: number;
  }) {
    const row: Coupon = {
      id: randomUUID(),
      barbershop_id: SHOP_ID,
      code: input.code.toUpperCase(),
      percent_off: input.percent_off,
      max_uses: input.max_uses ?? 100,
      used_count: 0,
      expires_at: null,
      is_active: true,
    };
    state().coupons.push(row);
    return { ...row };
  },

  addReview(input: {
    client_name: string;
    client_phone: string;
    rating: number;
    comment?: string | null;
    appointment_id?: string | null;
  }) {
    if (input.rating < 1 || input.rating > 5) throw new Error("Nota 1–5");
    const row: Review = {
      id: randomUUID(),
      barbershop_id: SHOP_ID,
      client_name: input.client_name,
      client_phone: input.client_phone,
      appointment_id: input.appointment_id ?? null,
      rating: input.rating,
      comment: input.comment ?? null,
      created_at: new Date().toISOString(),
    };
    state().reviews.unshift(row);
    return { ...row };
  },

  // —— Sinal ——
  createDeposit(input: {
    appointment_id: string;
    amount: number;
    method: PaymentMethod;
  }) {
    const row: AppointmentDeposit = {
      id: randomUUID(),
      appointment_id: input.appointment_id,
      amount: input.amount,
      method: input.method,
      status: "paid",
      created_at: new Date().toISOString(),
    };
    state().deposits.push(row);
    return { ...row };
  },

  // —— Relatórios ——
  reports() {
    const s = state();
    const paid = s.sales.filter((x) => x.status === "paid");
    const byMethod: Record<string, number> = {};
    for (const p of s.salePayments) {
      const sale = paid.find((x) => x.id === p.sale_id);
      if (!sale) continue;
      byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount;
    }
    const productSales = s.saleItems
      .filter((i) => i.kind === "product")
      .reduce<Record<string, number>>((acc, i) => {
        acc[i.description] = (acc[i.description] ?? 0) + i.quantity;
        return acc;
      }, {});
    const serviceSales = s.saleItems
      .filter((i) => i.kind === "service")
      .reduce<Record<string, number>>((acc, i) => {
        acc[i.description] = (acc[i.description] ?? 0) + i.quantity;
        return acc;
      }, {});
    const peakHours: Record<string, number> = {};
    for (const sale of paid) {
      const h = new Date(sale.created_at).getHours();
      const key = `${String(h).padStart(2, "0")}:00`;
      peakHours[key] = (peakHours[key] ?? 0) + 1;
    }
    const reviews = s.reviews;
    const avgRating =
      reviews.length > 0
        ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length
        : 0;

    return {
      cashflow: this.cashflowSummary(),
      ranking: this.ranking(),
      profitability: this.profitability(),
      replenishment: this.replenishmentSuggestions(),
      byMethod,
      topProducts: Object.entries(productSales)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5),
      topServices: Object.entries(serviceSales)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5),
      peakHours,
      lowStock: this.lowStock(),
      avgRating,
      reviewCount: reviews.length,
      waitlistWaiting: s.waitlist.filter((w) => w.status === "waiting").length,
      units: s.units.map((u) => ({ ...u })),
      auditLog: s.auditLog.slice(0, 30),
      fiscalDrafts: s.fiscalDocuments.filter((f) => f.status === "draft").length,
      cashDifferences: s.cashSessions
        .filter((c) => c.status === "closed" && (c.difference ?? 0) !== 0)
        .map((c) => ({
          id: c.id,
          closed_at: c.closed_at,
          difference: c.difference,
          expected_cash: c.expected_cash,
          closing_amount: c.closing_amount,
        })),
    };
  },

  listUnits() {
    return state().units.map((u) => ({ ...u } as ShopUnit));
  },

  addUnit(input: { name: string; slug: string; city: string }) {
    const row: ShopUnit = {
      id: randomUUID(),
      name: input.name,
      slug: input.slug,
      city: input.city,
      is_hq: false,
    };
    state().units.push(row);
    commit();
    return { ...row };
  },
};

const OPS_READ = new Set([
  "snapshot",
  "currentCash",
  "cashConference",
  "listProducts",
  "lowStock",
  "listSuppliers",
  "listPurchaseOrders",
  "ranking",
  "listPackages",
  "listSubscriptionPlans",
  "cashflowSummary",
  "replenishmentSuggestions",
  "profitability",
  "reports",
  "listUnits",
]);

export const opsStore: typeof opsStoreImpl = new Proxy(opsStoreImpl, {
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver);
    if (typeof value !== "function") return value;
    if (OPS_READ.has(String(prop))) {
      return (...args: unknown[]) => value.apply(target, args);
    }
    return (...args: unknown[]) => {
      const result = value.apply(target, args);
      // Métodos async: persistir após resolução
      if (result && typeof (result as Promise<unknown>).then === "function") {
        return (result as Promise<unknown>).then((resolved) => {
          commit();
          return resolved;
        });
      }
      commit();
      return result;
    };
  },
});
