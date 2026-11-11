"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Barber, Service, SessionUser } from "@/lib/types";
import type {
  Campaign,
  CashSession,
  ClientPackage,
  CommissionEntry,
  Coupon,
  Payable,
  Product,
  PurchaseOrder,
  Receivable,
  Sale,
  ServicePackage,
  ShopUnit,
  StaffAdvance,
  StockMovement,
  SubscriptionPlan,
  Supplier,
  WaitlistEntry,
} from "@/lib/types-ops";
import { staffAuthHeaders } from "@/lib/staff-session";
import { formatBRL, formatPhoneBR } from "@/lib/utils";

type OpsTab =
  | "caixa"
  | "estoque"
  | "financeiro"
  | "comissoes"
  | "pacotes"
  | "waitlist"
  | "marketing"
  | "relatorios"
  | "unidades";

type OpsPayload = {
  products: Product[];
  suppliers: Supplier[];
  stockMovements: StockMovement[];
  purchaseOrders: PurchaseOrder[];
  sales: Sale[];
  currentCash: CashSession | null;
  cashMovements: Array<{ id: string; type: string; amount: number; reason: string }>;
  commissionEntries: CommissionEntry[];
  staffAdvances: StaffAdvance[];
  commissionRules: Array<{
    barber_id: string | null;
    service_percent: number;
    product_percent: number;
  }>;
  packages: ServicePackage[];
  clientPackages: ClientPackage[];
  subscriptionPlans: SubscriptionPlan[];
  waitlist: WaitlistEntry[];
  payables: Payable[];
  receivables: Receivable[];
  campaigns: Campaign[];
  coupons: Coupon[];
  reviews: Array<{ id: string; client_name: string; rating: number; comment: string | null }>;
  deposits: Array<{ id: string; appointment_id: string; amount: number; status: string }>;
  lowStock: Product[];
  cashflow: {
    gross_revenue: number;
    cogs: number;
    expenses: number;
    net_profit: number;
    open_payables: number;
    open_receivables: number;
    ticket_avg: number;
  };
  ranking: Array<{
    barber_id: string;
    revenue: number;
    services: number;
    commission: number;
    goal: { revenue_target: number; services_target: number } | null;
  }>;
  units: ShopUnit[];
  permissions: Record<OpsTab, boolean>;
  session: SessionUser;
};

type ReportsPayload = {
  cashflow: OpsPayload["cashflow"];
  ranking: OpsPayload["ranking"];
  byMethod: Record<string, number>;
  topProducts: Array<[string, number]>;
  topServices: Array<[string, number]>;
  peakHours: Record<string, number>;
  lowStock: Product[];
  avgRating: number;
  reviewCount: number;
  waitlistWaiting: number;
  units: ShopUnit[];
  auditLog: Array<{ actor: string; action: string; detail: string; created_at: string }>;
};

export function AdminOpsPanel({
  barbers,
  services,
  clients,
  initialTab = "caixa",
  hideTabs = false,
  panelMode = "all",
}: {
  barbers: Barber[];
  services: Service[];
  clients: Array<{ id: string; full_name: string; phone: string }>;
  initialTab?: OpsTab;
  hideTabs?: boolean;
  /** Recorte estilo Salon Soft quando aberto pelo menu lateral. */
  panelMode?: "all" | "despesas" | "fiados" | "fornecedores";
}) {
  const [tab, setTab] = useState<OpsTab>(initialTab);
  const [data, setData] = useState<OpsPayload | null>(null);
  const [reports, setReports] = useState<ReportsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comandaFilter, setComandaFilter] = useState<"all" | "paid" | "refunded">(
    "all",
  );
  const [stockDelta, setStockDelta] = useState(5);
  const [supplierForm, setSupplierForm] = useState({
    name: "",
    phone: "",
    email: "",
    notes: "",
  });
  const [poForm, setPoForm] = useState({
    supplier_id: "",
    product_id: "",
    quantity: 10,
    unit_cost: 20,
    notes: "",
  });
  const [expenseMonth, setExpenseMonth] = useState(() =>
    new Date().toISOString().slice(0, 7),
  );
  const [valeForm, setValeForm] = useState({
    barber_id: "",
    amount: 50,
    reason: "Vale / adiantamento",
  });

  const [saleForm, setSaleForm] = useState({
    kind: "service" as "service" | "product",
    ref_id: "",
    barber_id: "",
    client_name: "",
    discount: 0,
    coupon_code: "",
  });
  const [cart, setCart] = useState<
    Array<{
      kind: "service" | "product";
      ref_id: string;
      description: string;
      quantity: number;
      unit_price: number;
    }>
  >([]);
  const [splits, setSplits] = useState([
    { method: "pix" as "pix" | "cash" | "debit" | "credit", amount: 0 },
  ]);
  const [productForm, setProductForm] = useState({
    name: "",
    price: 40,
    cost: 20,
    min_stock: 5,
    stock_qty: 10,
    category: "Geral",
  });
  const [payableForm, setPayableForm] = useState({
    description: "",
    amount: 100,
    due_date: new Date().toISOString().slice(0, 10),
    category: "Variável",
  });
  const [waitForm, setWaitForm] = useState({
    client_name: "",
    client_phone: "",
    preferred_date: "",
  });
  const [campaignForm, setCampaignForm] = useState({
    name: "",
    segment: "inactive" as const,
    message: "Sentimos sua falta! Agende pelo link Cortely.",
  });

  const reload = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/ops", {
      credentials: "include",
      headers: staffAuthHeaders(),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Falha ao carregar ops");
      return;
    }
    setData(json);
    if (!saleForm.ref_id && services[0]) {
      setSaleForm((s) => ({
        ...s,
        ref_id: services[0].id,
        barber_id: barbers[0]?.id || "",
      }));
    }
    const rep = await fetch("/api/ops?view=reports", {
      credentials: "include",
      headers: staffAuthHeaders(),
    });
    const repJson = await rep.json();
    if (rep.ok) setReports(repJson.reports);
  }, [barbers, services, saleForm.ref_id]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function action(body: Record<string, unknown>) {
    setError(null);
    const res = await fetch("/api/ops", {
      method: "POST",
      credentials: "include",
      headers: staffAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Erro");
    await reload();
    return json;
  }

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const tabs = useMemo(() => {
    if (!data) return [] as { id: OpsTab; label: string }[];
    return (
      [
        ["caixa", "Comandas"],
        ["estoque", "Produtos"],
        ["financeiro", "Despesas"],
        ["comissoes", "Comissões"],
        ["pacotes", "Pacotes"],
        ["waitlist", "Fila"],
        ["marketing", "Marketing"],
        ["relatorios", "Relatórios"],
        ["unidades", "Unidades"],
      ] as const
    )
      .filter(([id]) => data.permissions[id])
      .map(([id, label]) => ({ id, label }));
  }, [data]);

  if (!data) {
    return (
      <div className="mt-4 glass-panel rounded-2xl p-6 text-stone-400">
        {error || "Carregando módulos operacionais…"}
      </div>
    );
  }

  const selectedService = services.find((s) => s.id === saleForm.ref_id);
  const selectedProduct = data.products.find((p) => p.id === saleForm.ref_id);
  const filteredSales = data.sales.filter((sale) => {
    if (comandaFilter === "all") return true;
    return sale.status === comandaFilter;
  });

  return (
    <section className="mt-2 space-y-4">
      {!hideTabs && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-amber-400/80">
              Operação
            </p>
            <h2 className="font-display text-2xl text-stone-50">Gestão do salão</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {tabs.map((t) => (
              <Button
                key={t.id}
                size="sm"
                variant={tab === t.id ? "default" : "secondary"}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </Button>
            ))}
          </div>
        </div>
      )}
      {error && <p className="text-sm text-rose-400">{error}</p>}

      {tab === "caixa" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="glass-panel space-y-3 rounded-2xl p-5">
            <h3 className="font-display text-xl text-stone-50">Comandas / caixa</h3>
            {data.currentCash ? (
              <>
                <Badge>Aberto</Badge>
                <p className="text-sm text-stone-400">
                  Abertura {formatBRL(data.currentCash.opening_amount)} ·{" "}
                  {new Date(data.currentCash.opened_at).toLocaleString("pt-BR")}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      action({
                        action: "cash_movement",
                        type: "sangria",
                        amount: 50,
                        reason: "Troco / sangria rápida",
                      }).catch((e) => setError(e.message))
                    }
                  >
                    Sangria R$ 50
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      action({
                        action: "cash_movement",
                        type: "suprimento",
                        amount: 50,
                        reason: "Suprimento rápido",
                      }).catch((e) => setError(e.message))
                    }
                  >
                    Suprimento R$ 50
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() =>
                      action({
                        action: "close_cash",
                        closing_amount: data.cashflow.gross_revenue,
                      }).catch((e) => setError(e.message))
                    }
                  >
                    Fechar caixa
                  </Button>
                </div>
              </>
            ) : (
              <Button
                onClick={() =>
                  action({ action: "open_cash", opening_amount: 100 }).catch((e) =>
                    setError(e.message),
                  )
                }
              >
                Abrir caixa com R$ 100
              </Button>
            )}

            <h4 className="pt-2 font-medium text-stone-200">Comanda multi-item</h4>
            <select
              className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm"
              value={saleForm.kind}
              onChange={(e) => {
                const kind = e.target.value as "service" | "product";
                setSaleForm({
                  ...saleForm,
                  kind,
                  ref_id:
                    kind === "service"
                      ? services[0]?.id || ""
                      : data.products[0]?.id || "",
                });
              }}
            >
              <option value="service" className="bg-stone-900">
                Serviço
              </option>
              <option value="product" className="bg-stone-900">
                Produto
              </option>
            </select>
            <select
              className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm"
              value={saleForm.ref_id}
              onChange={(e) => setSaleForm({ ...saleForm, ref_id: e.target.value })}
            >
              {(saleForm.kind === "service" ? services : data.products).map((item) => (
                <option key={item.id} value={item.id} className="bg-stone-900">
                  {item.name} · {formatBRL(item.price)}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const unit =
                  saleForm.kind === "service"
                    ? selectedService?.price ?? 0
                    : selectedProduct?.price ?? 0;
                const description =
                  saleForm.kind === "service"
                    ? selectedService?.name ?? "Serviço"
                    : selectedProduct?.name ?? "Produto";
                setCart((c) => [
                  ...c,
                  {
                    kind: saleForm.kind,
                    ref_id: saleForm.ref_id,
                    description,
                    quantity: 1,
                    unit_price: unit,
                  },
                ]);
              }}
            >
              Adicionar à comanda
            </Button>
            {cart.length > 0 && (
              <div className="space-y-1 rounded-xl border border-white/10 p-3 text-sm">
                {cart.map((item, idx) => (
                  <div key={`${item.ref_id}-${idx}`} className="flex justify-between">
                    <span>
                      {item.description} × {item.quantity}
                    </span>
                    <span>{formatBRL(item.unit_price * item.quantity)}</span>
                  </div>
                ))}
                <p className="pt-1 font-medium text-amber-200">
                  Subtotal{" "}
                  {formatBRL(cart.reduce((a, i) => a + i.unit_price * i.quantity, 0))}
                </p>
                <Button size="sm" variant="ghost" onClick={() => setCart([])}>
                  Limpar comanda
                </Button>
              </div>
            )}
            <select
              className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm"
              value={saleForm.barber_id}
              onChange={(e) => setSaleForm({ ...saleForm, barber_id: e.target.value })}
            >
              {barbers.map((b) => (
                <option key={b.id} value={b.id} className="bg-stone-900">
                  {b.name}
                </option>
              ))}
            </select>
            <Input
              placeholder="Nome do cliente (opcional)"
              value={saleForm.client_name}
              onChange={(e) => setSaleForm({ ...saleForm, client_name: e.target.value })}
            />
            <Input
              placeholder="Cupom (ex: CORTELY10)"
              value={saleForm.coupon_code}
              onChange={(e) => setSaleForm({ ...saleForm, coupon_code: e.target.value })}
            />
            <Input
              type="number"
              placeholder="Desconto R$"
              value={saleForm.discount}
              onChange={(e) =>
                setSaleForm({ ...saleForm, discount: Number(e.target.value) })
              }
            />
            <div className="space-y-2 rounded-xl border border-white/10 p-3">
              <p className="text-xs text-stone-400">Pagamento dividido</p>
              {splits.map((split, idx) => (
                <div key={idx} className="grid grid-cols-2 gap-2">
                  <select
                    className="h-10 rounded-xl border border-white/10 bg-white/5 px-2 text-sm"
                    value={split.method}
                    onChange={(e) => {
                      const next = [...splits];
                      next[idx] = {
                        ...next[idx],
                        method: e.target.value as typeof split.method,
                      };
                      setSplits(next);
                    }}
                  >
                    {["pix", "cash", "debit", "credit"].map((m) => (
                      <option key={m} value={m} className="bg-stone-900">
                        {m}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    placeholder="Valor"
                    value={split.amount || ""}
                    onChange={(e) => {
                      const next = [...splits];
                      next[idx] = { ...next[idx], amount: Number(e.target.value) };
                      setSplits(next);
                    }}
                  />
                </div>
              ))}
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setSplits((s) => [...s, { method: "cash", amount: 0 }])
                }
              >
                + meio de pagamento
              </Button>
            </div>
            <Button
              onClick={async () => {
                try {
                  if (cart.length === 0) throw new Error("Adicione itens à comanda");
                  const subtotal = cart.reduce(
                    (a, i) => a + i.unit_price * i.quantity,
                    0,
                  );
                  const paySum = splits.reduce((a, s) => a + (s.amount || 0), 0);
                  const payments =
                    paySum > 0
                      ? splits.filter((s) => s.amount > 0)
                      : [{ method: "pix" as const, amount: subtotal }];
                  await action({
                    action: "create_sale",
                    client_name: saleForm.client_name || null,
                    barber_id: saleForm.barber_id || null,
                    discount: saleForm.discount,
                    coupon_code: saleForm.coupon_code || null,
                    items: cart,
                    payments,
                  });
                  setCart([]);
                  setSplits([{ method: "pix", amount: 0 }]);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Erro na venda");
                }
              }}
            >
              Fechar comanda
            </Button>
          </div>

          <div className="space-y-3">
            <div className="glass-panel rounded-2xl p-5 text-sm text-stone-300">
              Faturamento bruto {formatBRL(data.cashflow.gross_revenue)} · Ticket médio{" "}
              {formatBRL(data.cashflow.ticket_avg)} · Lucro líquido{" "}
              {formatBRL(data.cashflow.net_profit)}
            </div>
            <div className="glass-panel space-y-2 rounded-2xl p-4">
              <p className="text-sm font-medium text-stone-200">Comanda em aberto</p>
              {cart.length === 0 ? (
                <p className="text-sm text-stone-500">Nenhum item na comanda atual.</p>
              ) : (
                cart.map((item, idx) => (
                  <div
                    key={`${item.ref_id}-${idx}`}
                    className="flex justify-between text-sm text-stone-300"
                  >
                    <span>
                      {item.quantity}× {item.description}
                    </span>
                    <span>{formatBRL(item.unit_price * item.quantity)}</span>
                  </div>
                ))
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["all", "Todas"],
                  ["paid", "Fechadas"],
                  ["refunded", "Estornadas"],
                ] as const
              ).map(([id, label]) => (
                <Button
                  key={id}
                  size="sm"
                  variant={comandaFilter === id ? "default" : "secondary"}
                  onClick={() => setComandaFilter(id)}
                >
                  {label}
                </Button>
              ))}
            </div>
            {filteredSales.slice(0, 12).map((sale) => (
              <article
                key={sale.id}
                className="glass-panel flex items-center justify-between rounded-2xl p-4"
              >
                <div>
                  <p className="font-medium text-stone-100">
                    {sale.client_name || "Balcão"} · {formatBRL(sale.total)}
                  </p>
                  <p className="text-xs text-stone-500">
                    {new Date(sale.created_at).toLocaleString("pt-BR")} · {sale.status}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const w = window.open("", "_blank", "noopener,noreferrer");
                      if (!w) return;
                      w.document.write(
                        `<pre style="font-family:sans-serif;padding:24px">Cortely — Comanda\n${sale.client_name || "Balcão"}\n${formatBRL(sale.total)}\n${new Date(sale.created_at).toLocaleString("pt-BR")}\nStatus: ${sale.status}</pre>`,
                      );
                      w.document.close();
                      w.print();
                    }}
                  >
                    Imprimir
                  </Button>
                  {sale.status === "paid" && (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() =>
                        action({ action: "refund_sale", id: sale.id }).catch((e) =>
                          setError(e.message),
                        )
                      }
                    >
                      Estornar
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {tab === "estoque" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="glass-panel space-y-3 rounded-2xl p-5">
            <h3 className="font-display text-xl">Produtos · entrada / saída</h3>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-xs uppercase tracking-wide text-stone-500">
                  Qtd. movimento
                </label>
                <Input
                  type="number"
                  min={1}
                  value={stockDelta}
                  onChange={(e) => setStockDelta(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
            </div>
            <Input
              placeholder="Nome"
              value={productForm.name}
              onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                placeholder="Preço"
                value={productForm.price}
                onChange={(e) =>
                  setProductForm({ ...productForm, price: Number(e.target.value) })
                }
              />
              <Input
                type="number"
                placeholder="Custo"
                value={productForm.cost}
                onChange={(e) =>
                  setProductForm({ ...productForm, cost: Number(e.target.value) })
                }
              />
            </div>
            <Button
              onClick={() =>
                action({ action: "upsert_product", ...productForm })
                  .then(() =>
                    setProductForm({
                      name: "",
                      price: 40,
                      cost: 20,
                      min_stock: 5,
                      stock_qty: 10,
                      category: "Geral",
                    }),
                  )
                  .catch((e) => setError(e.message))
              }
            >
              Salvar produto
            </Button>
            {data.lowStock.length > 0 && (
              <p className="text-sm text-amber-300">
                Alerta reposição: {data.lowStock.map((p) => p.name).join(", ")}
              </p>
            )}
          </div>
          <div className="space-y-3">
            {data.products.map((p) => (
              <article key={p.id} className="glass-panel rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-stone-100">{p.name}</p>
                    <p className="text-sm text-stone-400">
                      Estoque {p.stock_qty} · mín {p.min_stock} · margem{" "}
                      {p.price > 0
                        ? `${Math.round(((p.price - p.cost) / p.price) * 100)}%`
                        : "—"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        action({
                          action: "adjust_stock",
                          product_id: p.id,
                          delta: stockDelta,
                          reason: "Entrada de estoque",
                        }).catch((e) => setError(e.message))
                      }
                    >
                      Entrada +{stockDelta}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        action({
                          action: "adjust_stock",
                          product_id: p.id,
                          delta: -stockDelta,
                          reason: "Saída de estoque",
                        }).catch((e) => setError(e.message))
                      }
                    >
                      Saída −{stockDelta}
                    </Button>
                  </div>
                </div>
              </article>
            ))}
            <div className="glass-panel space-y-3 rounded-2xl p-4">
              <h4 className="font-medium text-stone-100">Fornecedores</h4>
              <Input
                placeholder="Nome"
                value={supplierForm.name}
                onChange={(e) =>
                  setSupplierForm({ ...supplierForm, name: e.target.value })
                }
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Telefone"
                  value={supplierForm.phone}
                  onChange={(e) =>
                    setSupplierForm({ ...supplierForm, phone: e.target.value })
                  }
                />
                <Input
                  placeholder="E-mail"
                  value={supplierForm.email}
                  onChange={(e) =>
                    setSupplierForm({ ...supplierForm, email: e.target.value })
                  }
                />
              </div>
              <Button
                size="sm"
                onClick={() =>
                  action({
                    action: "upsert_supplier",
                    name: supplierForm.name,
                    phone: supplierForm.phone || null,
                    email: supplierForm.email || null,
                    notes: supplierForm.notes || null,
                  })
                    .then(() =>
                      setSupplierForm({
                        name: "",
                        phone: "",
                        email: "",
                        notes: "",
                      }),
                    )
                    .catch((e) => setError(e.message))
                }
              >
                Salvar fornecedor
              </Button>
              <p className="text-sm text-stone-400">
                {data.suppliers.map((s) => s.name).join(" · ") || "—"}
              </p>
            </div>
            <div className="glass-panel space-y-3 rounded-2xl p-4">
              <h4 className="font-medium text-stone-100">Ordem de compra</h4>
              <select
                className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm"
                value={poForm.supplier_id || data.suppliers[0]?.id || ""}
                onChange={(e) =>
                  setPoForm({ ...poForm, supplier_id: e.target.value })
                }
              >
                {data.suppliers.map((s) => (
                  <option key={s.id} value={s.id} className="bg-stone-900">
                    {s.name}
                  </option>
                ))}
              </select>
              <select
                className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm"
                value={poForm.product_id || data.products[0]?.id || ""}
                onChange={(e) =>
                  setPoForm({ ...poForm, product_id: e.target.value })
                }
              >
                {data.products.map((p) => (
                  <option key={p.id} value={p.id} className="bg-stone-900">
                    {p.name}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  placeholder="Qtd"
                  value={poForm.quantity}
                  onChange={(e) =>
                    setPoForm({ ...poForm, quantity: Number(e.target.value) })
                  }
                />
                <Input
                  type="number"
                  placeholder="Custo unit."
                  value={poForm.unit_cost}
                  onChange={(e) =>
                    setPoForm({ ...poForm, unit_cost: Number(e.target.value) })
                  }
                />
              </div>
              <Button
                size="sm"
                onClick={() =>
                  action({
                    action: "create_purchase_order",
                    supplier_id: poForm.supplier_id || data.suppliers[0]?.id,
                    notes: poForm.notes || null,
                    items: [
                      {
                        product_id: poForm.product_id || data.products[0]?.id,
                        quantity: poForm.quantity,
                        unit_cost: poForm.unit_cost,
                      },
                    ],
                  }).catch((e) => setError(e.message))
                }
              >
                Criar ordem
              </Button>
              {(data.purchaseOrders ?? []).slice(0, 6).map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm"
                >
                  <span>
                    {order.status} · {formatBRL(order.total_cost)} ·{" "}
                    {new Date(order.created_at).toLocaleDateString("pt-BR")}
                  </span>
                  {order.status !== "received" && order.status !== "canceled" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        action({
                          action: "receive_purchase_order",
                          id: order.id,
                        }).catch((e) => setError(e.message))
                      }
                    >
                      Receber
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <div className="glass-panel space-y-2 rounded-2xl p-4">
              <h4 className="font-medium text-stone-100">Movimentos recentes</h4>
              {(data.stockMovements ?? []).slice(0, 8).map((m) => {
                const product = data.products.find((p) => p.id === m.product_id);
                return (
                  <p key={m.id} className="text-xs text-stone-400">
                    {m.delta > 0 ? "+" : ""}
                    {m.delta} {product?.name ?? "produto"} · {m.reason}
                  </p>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {tab === "financeiro" && (
        <div className="grid gap-4 lg:grid-cols-2">
          {panelMode !== "fiados" && (
            <div className="glass-panel space-y-3 rounded-2xl p-5">
              <h3 className="font-display text-xl">Despesas / contas a pagar</h3>
              <Input
                type="month"
                value={expenseMonth}
                onChange={(e) => setExpenseMonth(e.target.value)}
              />
              <Input
                placeholder="Descrição"
                value={payableForm.description}
                onChange={(e) =>
                  setPayableForm({ ...payableForm, description: e.target.value })
                }
              />
              <select
                className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm"
                value={payableForm.category}
                onChange={(e) =>
                  setPayableForm({ ...payableForm, category: e.target.value })
                }
              >
                {["Fixo", "Variável", "Estoque", "Marketing", "Outros"].map((c) => (
                  <option key={c} value={c} className="bg-stone-900">
                    {c}
                  </option>
                ))}
              </select>
              <Input
                type="number"
                value={payableForm.amount}
                onChange={(e) =>
                  setPayableForm({ ...payableForm, amount: Number(e.target.value) })
                }
              />
              <Input
                type="date"
                value={payableForm.due_date}
                onChange={(e) =>
                  setPayableForm({ ...payableForm, due_date: e.target.value })
                }
              />
              <Button
                onClick={() =>
                  action({ action: "upsert_payable", ...payableForm }).catch((e) =>
                    setError(e.message),
                  )
                }
              >
                Lançar despesa
              </Button>
              {data.payables
                .filter((p) => p.due_date.startsWith(expenseMonth))
                .map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-xl border border-white/10 px-3 py-2 text-sm"
                  >
                    <span>
                      {p.category} · {p.description} · {formatBRL(p.amount)} ·{" "}
                      {p.status}
                    </span>
                    {p.status === "open" && (
                      <Button
                        size="sm"
                        onClick={() =>
                          action({ action: "pay_payable", id: p.id }).catch((e) =>
                            setError(e.message),
                          )
                        }
                      >
                        Pagar
                      </Button>
                    )}
                  </div>
                ))}
            </div>
          )}
          {panelMode !== "despesas" && (
            <div className="glass-panel space-y-3 rounded-2xl p-5">
              <h3 className="font-display text-xl">Fiados / a receber</h3>
              <Input placeholder="Nome do cliente" id="fiado-name" defaultValue="" />
              <Input type="number" placeholder="Valor" id="fiado-amount" defaultValue={55} />
              <Button
                variant="outline"
                onClick={() => {
                  const name = (
                    document.getElementById("fiado-name") as HTMLInputElement | null
                  )?.value?.trim();
                  const amount = Number(
                    (document.getElementById("fiado-amount") as HTMLInputElement | null)
                      ?.value || 55,
                  );
                  action({
                    action: "upsert_receivable",
                    client_name: name || "Cliente fiado",
                    description: "Serviço fiado",
                    amount,
                    due_date: new Date().toISOString().slice(0, 10),
                  }).catch((e) => setError(e.message));
                }}
              >
                Registrar fiado
              </Button>
              {data.receivables.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-xl border border-white/10 px-3 py-2 text-sm"
                >
                  <span>
                    {r.client_name} · {formatBRL(r.amount)} · {r.status}
                  </span>
                  {r.status === "open" && (
                    <Button
                      size="sm"
                      onClick={() =>
                        action({ action: "pay_receivable", id: r.id }).catch((e) =>
                          setError(e.message),
                        )
                      }
                    >
                      Receber
                    </Button>
                  )}
                </div>
              ))}
              {panelMode === "all" && (
                <div className="rounded-xl bg-white/5 p-3 text-sm text-stone-300">
                  DRE rápido: receita {formatBRL(data.cashflow.gross_revenue)} − CMV{" "}
                  {formatBRL(data.cashflow.cogs)} − despesas{" "}
                  {formatBRL(data.cashflow.expenses)} ={" "}
                  <strong>{formatBRL(data.cashflow.net_profit)}</strong>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "comissoes" && (
        <div className="space-y-3">
          <div className="glass-panel rounded-2xl p-5 text-sm text-stone-300">
            Regra padrão:{" "}
            {data.commissionRules[0]
              ? `${data.commissionRules[0].service_percent}% serviço / ${data.commissionRules[0].product_percent}% produto`
              : "—"}
            . Ao pagar, vales abertos são descontados automaticamente.
          </div>
          <div className="glass-panel space-y-3 rounded-2xl p-5">
            <h3 className="font-display text-xl text-stone-50">Vales / adiantamentos</h3>
            <select
              className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm"
              value={valeForm.barber_id || barbers[0]?.id || ""}
              onChange={(e) => setValeForm({ ...valeForm, barber_id: e.target.value })}
            >
              {barbers.map((b) => (
                <option key={b.id} value={b.id} className="bg-stone-900">
                  {b.name}
                </option>
              ))}
            </select>
            <Input
              type="number"
              value={valeForm.amount}
              onChange={(e) =>
                setValeForm({ ...valeForm, amount: Number(e.target.value) })
              }
            />
            <Input
              value={valeForm.reason}
              onChange={(e) => setValeForm({ ...valeForm, reason: e.target.value })}
            />
            <Button
              size="sm"
              onClick={() =>
                action({
                  action: "create_staff_advance",
                  barber_id: valeForm.barber_id || barbers[0]?.id,
                  amount: valeForm.amount,
                  reason: valeForm.reason,
                }).catch((e) => setError(e.message))
              }
            >
              Lançar vale
            </Button>
            {(data.staffAdvances ?? [])
              .filter((a) => a.status === "open")
              .map((a) => {
                const barber = barbers.find((b) => b.id === a.barber_id);
                return (
                  <p key={a.id} className="text-sm text-amber-200/90">
                    Aberto · {barber?.name} · {formatBRL(a.amount)} · {a.reason}
                  </p>
                );
              })}
          </div>
          {data.ranking.map((row) => {
            const barber = barbers.find((b) => b.id === row.barber_id);
            return (
              <article
                key={row.barber_id}
                className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4"
              >
                <div>
                  <p className="font-medium text-stone-100">{barber?.name ?? row.barber_id}</p>
                  <p className="text-sm text-stone-400">
                    {formatBRL(row.revenue)} · {row.services} atend. · comissão{" "}
                    {formatBRL(row.commission)}
                    {row.goal
                      ? ` · meta ${formatBRL(row.goal.revenue_target)}`
                      : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() =>
                    action({ action: "pay_commissions", barber_id: row.barber_id }).catch(
                      (e) => setError(e.message),
                    )
                  }
                >
                  Pagar comissões
                </Button>
              </article>
            );
          })}
          {data.commissionEntries.slice(0, 10).map((c) => (
            <div key={c.id} className="text-sm text-stone-500">
              {formatBRL(c.amount)} · {c.status} · {c.percent}%
            </div>
          ))}
        </div>
      )}

      {tab === "pacotes" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            {data.packages.map((p) => (
              <article key={p.id} className="glass-panel rounded-2xl p-4">
                <p className="font-medium text-stone-100">{p.name}</p>
                <p className="text-sm text-stone-400">
                  {p.credits} créditos · {formatBRL(p.price)} · {p.valid_days} dias
                </p>
                <Button
                  className="mt-2"
                  size="sm"
                  disabled={!clients[0]}
                  onClick={() =>
                    action({
                      action: "sell_package",
                      client_id: clients[0].id,
                      package_id: p.id,
                    }).catch((e) => setError(e.message))
                  }
                >
                  Vender para {clients[0]?.full_name ?? "cliente"}
                </Button>
              </article>
            ))}
            {data.subscriptionPlans.map((plan) => (
              <article key={plan.id} className="glass-panel rounded-2xl p-4">
                <p className="font-medium">{plan.name}</p>
                <p className="text-sm text-stone-400">
                  {formatBRL(plan.price_monthly)}/mês · {plan.credits_per_month} créditos
                </p>
                <Button
                  className="mt-2"
                  size="sm"
                  variant="outline"
                  disabled={!clients[0]}
                  onClick={() =>
                    action({
                      action: "subscribe_client",
                      client_id: clients[0].id,
                      plan_id: plan.id,
                    }).catch((e) => setError(e.message))
                  }
                >
                  Assinar cliente
                </Button>
              </article>
            ))}
          </div>
          <div className="glass-panel rounded-2xl p-5 text-sm text-stone-300">
            Pacotes ativos de clientes: {data.clientPackages.length}
            <ul className="mt-3 space-y-2">
              {data.clientPackages.map((cp) => (
                <li key={cp.id}>
                  {cp.credits_left}/{cp.credits_total} créditos · {cp.status}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {tab === "waitlist" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="glass-panel space-y-3 rounded-2xl p-5">
            <h3 className="font-display text-xl">Lista de espera / encaixe</h3>
            <Input
              placeholder="Nome"
              value={waitForm.client_name}
              onChange={(e) => setWaitForm({ ...waitForm, client_name: e.target.value })}
            />
            <Input
              placeholder="WhatsApp"
              value={waitForm.client_phone}
              onChange={(e) => setWaitForm({ ...waitForm, client_phone: e.target.value })}
            />
            <Input
              type="date"
              value={waitForm.preferred_date}
              onChange={(e) =>
                setWaitForm({ ...waitForm, preferred_date: e.target.value })
              }
            />
            <Button
              onClick={() =>
                action({
                  action: "add_waitlist",
                  ...waitForm,
                  preferred_date: waitForm.preferred_date || null,
                }).catch((e) => setError(e.message))
              }
            >
              Adicionar à fila
            </Button>
          </div>
          <div className="space-y-3">
            {data.waitlist.map((w) => (
              <article
                key={w.id}
                className="glass-panel flex items-center justify-between rounded-2xl p-4"
              >
                <div>
                  <p className="font-medium">{w.client_name}</p>
                  <p className="text-sm text-stone-400">
                    {formatPhoneBR(w.client_phone)} · {w.status}
                  </p>
                </div>
                {w.status === "waiting" && (
                  <Button
                    size="sm"
                    onClick={() =>
                      action({
                        action: "waitlist_status",
                        id: w.id,
                        status: "offered",
                      }).catch((e) => setError(e.message))
                    }
                  >
                    Oferecer vaga
                  </Button>
                )}
              </article>
            ))}
          </div>
        </div>
      )}

      {tab === "marketing" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="glass-panel space-y-3 rounded-2xl p-5">
            <h3 className="font-display text-xl">Campanha</h3>
            <Input
              placeholder="Nome"
              value={campaignForm.name}
              onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })}
            />
            <select
              className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm"
              value={campaignForm.segment}
              onChange={(e) =>
                setCampaignForm({
                  ...campaignForm,
                  segment: e.target.value as typeof campaignForm.segment,
                })
              }
            >
              <option value="inactive" className="bg-stone-900">
                Inativos
              </option>
              <option value="birthday" className="bg-stone-900">
                Aniversariantes
              </option>
              <option value="frequent" className="bg-stone-900">
                Frequentes
              </option>
              <option value="all" className="bg-stone-900">
                Todos
              </option>
            </select>
            <Input
              value={campaignForm.message}
              onChange={(e) =>
                setCampaignForm({ ...campaignForm, message: e.target.value })
              }
            />
            <Button
              onClick={async () => {
                try {
                  const created = await action({
                    action: "create_campaign",
                    ...campaignForm,
                  });
                  await action({
                    action: "send_campaign",
                    id: created.campaign.id,
                  });
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Erro");
                }
              }}
            >
              Criar e enviar (WhatsApp)
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                action({
                  action: "upsert_coupon",
                  code: `PROMO${Math.floor(Math.random() * 90 + 10)}`,
                  percent_off: 15,
                }).catch((e) => setError(e.message))
              }
            >
              Gerar cupom 15%
            </Button>
          </div>
          <div className="space-y-3">
            {data.campaigns.map((c) => (
              <article key={c.id} className="glass-panel rounded-2xl p-4 text-sm">
                <p className="font-medium">{c.name}</p>
                <p className="text-stone-400">
                  {c.segment} · {c.status}
                </p>
              </article>
            ))}
            {data.coupons.map((c) => (
              <div key={c.id} className="text-sm text-stone-400">
                Cupom {c.code} · {c.percent_off}% · {c.used_count}/{c.max_uses}
              </div>
            ))}
            <Button
              variant="secondary"
              onClick={() =>
                action({
                  action: "add_review",
                  client_name: "Cliente demo",
                  client_phone: "11999990000",
                  rating: 5,
                  comment: "Atendimento excelente",
                }).catch((e) => setError(e.message))
              }
            >
              Registrar avaliação 5★
            </Button>
            {data.reviews.map((r) => (
              <div key={r.id} className="text-sm text-amber-200">
                {r.rating}★ {r.client_name}: {r.comment}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "relatorios" && reports && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="glass-panel rounded-2xl p-5 text-sm text-stone-300 md:col-span-2 flex flex-wrap gap-2">
            <a href="/api/export?kind=sales">
              <Button size="sm" variant="outline">
                Exportar vendas CSV
              </Button>
            </a>
            <a href="/api/export?kind=products">
              <Button size="sm" variant="outline">
                Exportar estoque CSV
              </Button>
            </a>
            <a href="/api/export?kind=commissions">
              <Button size="sm" variant="outline">
                Exportar comissões CSV
              </Button>
            </a>
          </div>
          <div className="glass-panel rounded-2xl p-5 text-sm text-stone-300">
            <h3 className="mb-2 font-display text-xl text-stone-50">Indicadores</h3>
            <p>Receita {formatBRL(reports.cashflow.gross_revenue)}</p>
            <p>Lucro {formatBRL(reports.cashflow.net_profit)}</p>
            <p>Ticket {formatBRL(reports.cashflow.ticket_avg)}</p>
            <p>
              NPS/avaliações {reports.avgRating.toFixed(1)}★ ({reports.reviewCount})
            </p>
            <p>Fila de espera {reports.waitlistWaiting}</p>
          </div>
          <div className="glass-panel rounded-2xl p-5 text-sm text-stone-300">
            <h3 className="mb-2 font-display text-xl text-stone-50">Mix de pagamento</h3>
            {Object.entries(reports.byMethod).map(([m, v]) => (
              <p key={m}>
                {m}: {formatBRL(v)}
              </p>
            ))}
            <h4 className="mt-3 font-medium text-stone-200">Horários pico</h4>
            {Object.entries(reports.peakHours)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([h, n]) => (
                <p key={h}>
                  {h} · {n} vendas
                </p>
              ))}
          </div>
          <div className="glass-panel rounded-2xl p-5 text-sm md:col-span-2">
            <h3 className="mb-2 font-display text-xl">Auditoria recente</h3>
            {reports.auditLog.slice(0, 12).map((a, idx) => (
              <p key={idx} className="text-stone-500">
                {new Date(a.created_at).toLocaleString("pt-BR")} · {a.actor} · {a.action}{" "}
                · {a.detail}
              </p>
            ))}
          </div>
        </div>
      )}

      {tab === "unidades" && (
        <div className="space-y-3">
          {data.units.map((u) => (
            <article key={u.id} className="glass-panel rounded-2xl p-4">
              <p className="font-medium text-stone-100">
                {u.name} {u.is_hq ? <Badge>HQ</Badge> : null}
              </p>
              <p className="text-sm text-stone-400">
                /{u.slug} · {u.city}
              </p>
            </article>
          ))}
          <Button
            onClick={() =>
              action({
                action: "add_unit",
                name: "Navalha Negra — Nova unidade",
                slug: `navalha-${Date.now().toString().slice(-4)}`,
                city: "São Paulo",
              }).catch((e) => setError(e.message))
            }
          >
            Adicionar unidade
          </Button>
        </div>
      )}
    </section>
  );
}
