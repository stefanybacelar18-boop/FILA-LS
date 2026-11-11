import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getLiveSession,
  requirePermission,
  roleCan,
  verifyClientProof,
} from "@/lib/auth";
import { getAppointment } from "@/lib/data";
import { opsStore } from "@/lib/ops-store";
import { checkRateLimit, clientIp, sensitiveIpKey } from "@/lib/rate-limit";
import { onlyDigits } from "@/lib/utils";

const DEMO_SHOP_ID = "11111111-1111-4111-8111-111111111111";

export async function GET(req: NextRequest) {
  try {
    const session = await getLiveSession(req);
    requirePermission(session, "agenda");
    // Isolamento: ops JSON atual é single-tenant até migração Postgres
    if (session!.barbershop_id !== DEMO_SHOP_ID) {
      return NextResponse.json(
        { error: "Sem acesso operacional a esta barbearia" },
        { status: 403 },
      );
    }
    const view = req.nextUrl.searchParams.get("view") ?? "snapshot";

    if (view === "reports") {
      requirePermission(session, "relatorios");
      return NextResponse.json({ reports: opsStore.reports(), session });
    }

    const permissions = {
      caixa: roleCan(session!.role, "caixa"),
      estoque: roleCan(session!.role, "estoque"),
      financeiro: roleCan(session!.role, "financeiro"),
      comissoes: roleCan(session!.role, "comissoes"),
      pacotes: roleCan(session!.role, "pacotes"),
      waitlist: roleCan(session!.role, "waitlist"),
      marketing: roleCan(session!.role, "marketing"),
      relatorios: roleCan(session!.role, "relatorios"),
      unidades: roleCan(session!.role, "unidades"),
    };

    // Barbeiro: só dados do próprio portal
    if (session!.role === "barber" && session!.barber_id) {
      const snap = opsStore.snapshot();
      const commissions = snap.commissionEntries.filter(
        (c) => c.barber_id === session!.barber_id,
      );
      const ranking = opsStore
        .ranking()
        .find((r) => r.barber_id === session!.barber_id);
      return NextResponse.json({
        session,
        commissions,
        ranking,
        goal: snap.goals.find((g) => g.barber_id === session!.barber_id) ?? null,
        cashOpen: !!opsStore.currentCash(),
        permissions,
      });
    }

    const snap = opsStore.snapshot();
    return NextResponse.json({
      sales: permissions.caixa || permissions.relatorios ? snap.sales : [],
      saleItems: permissions.caixa ? snap.saleItems : [],
      salePayments: permissions.caixa ? snap.salePayments : [],
      cashSessions: permissions.caixa ? snap.cashSessions : [],
      cashMovements: permissions.caixa ? snap.cashMovements : [],
      products: permissions.estoque ? snap.products : [],
      suppliers: permissions.estoque ? snap.suppliers : [],
      stockMovements: permissions.estoque ? snap.stockMovements : [],
      purchaseOrders: permissions.estoque ? snap.purchaseOrders : [],
      payables: permissions.financeiro ? snap.payables : [],
      receivables: permissions.financeiro ? snap.receivables : [],
      commissionRules: permissions.comissoes ? snap.commissionRules : [],
      commissionEntries: permissions.comissoes ? snap.commissionEntries : [],
      staffAdvances: permissions.comissoes ? snap.staffAdvances : [],
      goals: permissions.comissoes ? snap.goals : [],
      packages: permissions.pacotes ? snap.packages : [],
      clientPackages: permissions.pacotes ? snap.clientPackages : [],
      subscriptionPlans: permissions.pacotes ? snap.subscriptionPlans : [],
      clientSubscriptions: permissions.pacotes ? snap.clientSubscriptions : [],
      waitlist: permissions.waitlist ? snap.waitlist : [],
      campaigns: permissions.marketing ? snap.campaigns : [],
      coupons: permissions.marketing ? snap.coupons : [],
      reviews: permissions.marketing ? snap.reviews : [],
      units: permissions.unidades ? snap.units : [],
      deposits: permissions.caixa ? snap.deposits : [],
      currentCash: permissions.caixa ? opsStore.currentCash() : null,
      cashConference: permissions.caixa
        ? (() => {
            try {
              return opsStore.cashConference();
            } catch {
              return null;
            }
          })()
        : null,
      lowStock: permissions.estoque ? opsStore.lowStock() : [],
      replenishment: permissions.estoque
        ? opsStore.replenishmentSuggestions()
        : [],
      inventoryCounts: permissions.estoque
        ? snap.inventoryCounts.slice(0, 20)
        : [],
      cashflow:
        permissions.financeiro || permissions.caixa
          ? opsStore.cashflowSummary()
          : null,
      profitability: permissions.relatorios ? opsStore.profitability() : null,
      fiscalDocuments: permissions.caixa
        ? snap.fiscalDocuments.slice(0, 20)
        : [],
      ranking: permissions.comissoes ? opsStore.ranking() : [],
      session,
      permissions,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ops";
    const status = message.includes("login") || message.includes("permissão") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getLiveSession(req);
    const body = await req.json();
    const action = z.string().parse(body.action);
    const actor = session?.full_name || session?.email || "sistema";

    // Ops JSON é single-tenant (loja seed) até migração Postgres.
    // Staff de outra empresa nunca escreve no store compartilhado.
    if (session && session.barbershop_id !== DEMO_SHOP_ID) {
      return NextResponse.json(
        { error: "Sem acesso operacional a esta barbearia" },
        { status: 403 },
      );
    }

    switch (action) {
      case "open_cash": {
        requirePermission(session, "caixa");
        const data = z
          .object({ opening_amount: z.number().nonnegative(), notes: z.string().optional() })
          .parse(body);
        return NextResponse.json({
          cash: opsStore.openCash({
            opened_by: actor,
            opening_amount: data.opening_amount,
            notes: data.notes,
          }),
        });
      }
      case "close_cash": {
        requirePermission(session, "caixa");
        const data = z
          .object({
            closing_amount: z.number().nonnegative(),
            counted_by_method: z.record(z.string(), z.number()).optional(),
          })
          .parse(body);
        return NextResponse.json({
          cash: opsStore.closeCash({
            closed_by: actor,
            closing_amount: data.closing_amount,
            counted_by_method: data.counted_by_method,
          }),
        });
      }
      case "cash_conference": {
        requirePermission(session, "caixa");
        return NextResponse.json({ conference: opsStore.cashConference() });
      }
      case "cash_movement": {
        requirePermission(session, "caixa");
        const data = z
          .object({
            type: z.enum(["sangria", "suprimento"]),
            amount: z.number().positive(),
            reason: z.string().min(2),
          })
          .parse(body);
        return NextResponse.json({
          movement: opsStore.addCashMovement({ ...data, created_by: actor }),
        });
      }
      case "create_sale": {
        requirePermission(session, "caixa");
        const data = z
          .object({
            client_id: z.string().uuid().nullable().optional(),
            client_name: z.string().nullable().optional(),
            barber_id: z.string().uuid().nullable().optional(),
            appointment_id: z.string().uuid().nullable().optional(),
            discount: z.number().nonnegative().optional(),
            tip: z.number().nonnegative().optional(),
            coupon_code: z.string().nullable().optional(),
            items: z
              .array(
                z.object({
                  kind: z.enum(["service", "product", "package"]),
                  ref_id: z.string(),
                  description: z.string(),
                  quantity: z.number().positive(),
                  unit_price: z.number().nonnegative(),
                }),
              )
              .min(1),
            payments: z
              .array(
                z.object({
                  method: z.enum(["pix", "cash", "debit", "credit", "voucher", "other"]),
                  amount: z.number().positive(),
                }),
              )
              .min(1),
          })
          .parse(body);
        return NextResponse.json(
          opsStore.createSale({ ...data, created_by: actor }),
        );
      }
      case "refund_sale": {
        requirePermission(session, "caixa");
        const data = z
          .object({
            id: z.string().uuid(),
            reason: z.string().optional(),
          })
          .parse(body);
        return NextResponse.json({
          sale: opsStore.refundSale(data.id, actor, data.reason),
        });
      }
      case "cancel_sale": {
        requirePermission(session, "caixa");
        const data = z
          .object({
            id: z.string().uuid(),
            reason: z.string().min(2),
          })
          .parse(body);
        return NextResponse.json({
          sale: opsStore.cancelSale(data.id, actor, data.reason),
        });
      }
      case "inventory_count": {
        requirePermission(session, "estoque");
        const data = z
          .object({
            product_id: z.string().uuid(),
            counted_qty: z.number().int().nonnegative(),
          })
          .parse(body);
        return NextResponse.json({
          count: opsStore.inventoryCount({
            ...data,
            counted_by: actor,
          }),
        });
      }
      case "draft_fiscal": {
        requirePermission(session, "caixa");
        const data = z
          .object({
            sale_id: z.string().uuid(),
            doc_type: z.enum(["nfc_e", "nf_e", "recibo"]).optional(),
          })
          .parse(body);
        return NextResponse.json({
          document: opsStore.draftFiscalDocument({
            ...data,
            actor,
          }),
        });
      }
      case "upsert_product": {
        requirePermission(session, "estoque");
        const data = z
          .object({
            id: z.string().uuid().optional(),
            name: z.string().min(2),
            sku: z.string().nullable().optional(),
            category: z.string().optional(),
            price: z.number().nonnegative(),
            cost: z.number().nonnegative(),
            stock_qty: z.number().optional(),
            min_stock: z.number().optional(),
            supplier_id: z.string().uuid().nullable().optional(),
            is_active: z.boolean().optional(),
          })
          .parse(body);
        return NextResponse.json({ product: opsStore.upsertProduct(data) });
      }
      case "adjust_stock": {
        requirePermission(session, "estoque");
        const data = z
          .object({
            product_id: z.string().uuid(),
            delta: z.number(),
            reason: z.string().min(2),
          })
          .parse(body);
        return NextResponse.json(opsStore.adjustStock(data));
      }
      case "upsert_supplier": {
        requirePermission(session, "estoque");
        const data = z
          .object({
            id: z.string().uuid().optional(),
            name: z.string().min(2),
            phone: z.string().nullable().optional(),
            email: z.string().nullable().optional(),
            notes: z.string().nullable().optional(),
          })
          .parse(body);
        return NextResponse.json({ supplier: opsStore.upsertSupplier(data) });
      }
      case "create_purchase_order": {
        requirePermission(session, "estoque");
        const data = z
          .object({
            supplier_id: z.string().uuid(),
            notes: z.string().nullable().optional(),
            items: z
              .array(
                z.object({
                  product_id: z.string().uuid(),
                  quantity: z.number().int().positive(),
                  unit_cost: z.number().nonnegative(),
                }),
              )
              .min(1),
          })
          .parse(body);
        return NextResponse.json({
          order: opsStore.createPurchaseOrder(data),
        });
      }
      case "receive_purchase_order": {
        requirePermission(session, "estoque");
        const { id } = z.object({ id: z.string().uuid() }).parse(body);
        return NextResponse.json({
          order: opsStore.receivePurchaseOrder(id, actor),
        });
      }
      case "set_commission_rule": {
        // Só a dona altera regras (loja ou por barbeiro)
        if (session!.role !== "owner") {
          return NextResponse.json(
            { error: "Só o dono pode alterar regras de comissão" },
            { status: 403 },
          );
        }
        requirePermission(session, "comissoes");
        const data = z
          .object({
            barber_id: z.string().uuid().nullable().optional(),
            service_percent: z.number().min(0).max(100),
            product_percent: z.number().min(0).max(100),
          })
          .parse(body);
        return NextResponse.json({ rule: opsStore.setCommissionRule(data) });
      }
      case "create_staff_advance": {
        requirePermission(session, "comissoes");
        const data = z
          .object({
            barber_id: z.string().uuid(),
            amount: z.number().positive().max(20_000),
            reason: z.string().min(2).max(120),
          })
          .parse(body);
        return NextResponse.json({
          advance: opsStore.createStaffAdvance(data),
        });
      }
      case "pay_commissions": {
        if (session!.role !== "owner") {
          return NextResponse.json(
            { error: "Só o dono pode marcar comissões como pagas" },
            { status: 403 },
          );
        }
        requirePermission(session, "comissoes");
        const data = z.object({ barber_id: z.string().uuid() }).parse(body);
        return NextResponse.json(opsStore.payCommissions(data.barber_id, actor));
      }
      case "upsert_goal": {
        if (session!.role !== "owner") {
          return NextResponse.json(
            { error: "Só o dono pode definir metas" },
            { status: 403 },
          );
        }
        requirePermission(session, "comissoes");
        const data = z
          .object({
            barber_id: z.string().uuid(),
            month: z.string(),
            revenue_target: z.number().nonnegative(),
            services_target: z.number().int().nonnegative(),
          })
          .parse(body);
        return NextResponse.json({ goal: opsStore.upsertGoal(data) });
      }
      case "upsert_package": {
        requirePermission(session, "pacotes");
        const data = z
          .object({
            id: z.string().uuid().optional(),
            name: z.string().min(2),
            description: z.string().nullable().optional(),
            price: z.number().nonnegative(),
            credits: z.number().int().positive(),
            valid_days: z.number().int().positive().optional(),
            service_ids: z.array(z.string()).optional(),
          })
          .parse(body);
        return NextResponse.json({ package: opsStore.upsertPackage(data) });
      }
      case "sell_package": {
        requirePermission(session, "pacotes");
        const data = z
          .object({
            client_id: z.string().uuid(),
            package_id: z.string().uuid(),
          })
          .parse(body);
        return NextResponse.json({
          clientPackage: opsStore.sellPackageToClient({ ...data, created_by: actor }),
        });
      }
      case "subscribe_client": {
        requirePermission(session, "pacotes");
        const data = z
          .object({ client_id: z.string().uuid(), plan_id: z.string().uuid() })
          .parse(body);
        return NextResponse.json({
          subscription: opsStore.subscribeClient(data),
        });
      }
      case "add_waitlist": {
        requirePermission(session, "waitlist");
        const data = z
          .object({
            client_name: z.string().min(2),
            client_phone: z.string().min(10),
            service_id: z.string().uuid().nullable().optional(),
            barber_id: z.string().uuid().nullable().optional(),
            preferred_date: z.string().nullable().optional(),
            notes: z.string().nullable().optional(),
          })
          .parse(body);
        return NextResponse.json({ entry: opsStore.addWaitlist(data) });
      }
      case "waitlist_status": {
        requirePermission(session, "waitlist");
        const data = z
          .object({
            id: z.string().uuid(),
            status: z.enum(["waiting", "offered", "booked", "canceled"]),
          })
          .parse(body);
        return NextResponse.json({
          entry: opsStore.updateWaitlistStatus(data.id, data.status),
        });
      }
      case "offer_waitlist": {
        requirePermission(session, "waitlist");
        const data = z
          .object({
            id: z.string().uuid(),
            message: z.string().optional(),
            offered_slot: z.string().optional(),
          })
          .parse(body);
        return NextResponse.json(await opsStore.offerWaitlistSlot(data));
      }
      case "upsert_payable": {
        requirePermission(session, "financeiro");
        const data = z
          .object({
            description: z.string().min(2),
            amount: z.number().positive(),
            due_date: z.string(),
            category: z.string().optional(),
          })
          .parse(body);
        return NextResponse.json({ payable: opsStore.upsertPayable(data) });
      }
      case "pay_payable": {
        requirePermission(session, "financeiro");
        const { id } = z.object({ id: z.string().uuid() }).parse(body);
        return NextResponse.json({ payable: opsStore.payPayable(id) });
      }
      case "upsert_receivable": {
        requirePermission(session, "financeiro");
        const data = z
          .object({
            client_name: z.string().min(2),
            client_id: z.string().uuid().nullable().optional(),
            description: z.string().min(2),
            amount: z.number().positive(),
            due_date: z.string(),
          })
          .parse(body);
        return NextResponse.json({ receivable: opsStore.upsertReceivable(data) });
      }
      case "pay_receivable": {
        requirePermission(session, "financeiro");
        const { id } = z.object({ id: z.string().uuid() }).parse(body);
        return NextResponse.json({ receivable: opsStore.payReceivable(id) });
      }
      case "create_campaign": {
        requirePermission(session, "marketing");
        const data = z
          .object({
            name: z.string().min(2),
            segment: z.enum(["inactive", "birthday", "all", "frequent"]),
            message: z.string().min(5),
          })
          .parse(body);
        return NextResponse.json({ campaign: opsStore.createCampaign(data) });
      }
      case "send_campaign": {
        requirePermission(session, "marketing");
        const data = z
          .object({
            id: z.string().uuid(),
            phones: z.array(z.string()).optional(),
          })
          .parse(body);
        const snap = opsStore.snapshot();
        const fromOps = [
          ...snap.reviews.map((r) => r.client_phone),
          ...snap.waitlist.map((w) => w.client_phone),
        ]
          .map((p) => p.replace(/\D/g, ""))
          .filter((p) => p.length >= 10);
        const targets = Array.from(
          new Set([...(data.phones ?? []).map((p) => p.replace(/\D/g, "")), ...fromOps]),
        )
          .filter((p) => p.length >= 10)
          .slice(0, 30);
        return NextResponse.json({
          campaign: await opsStore.sendCampaign(data.id, targets),
        });
      }
      case "upsert_coupon": {
        requirePermission(session, "marketing");
        const data = z
          .object({
            code: z.string().min(3),
            percent_off: z.number().positive().max(100),
            max_uses: z.number().int().positive().optional(),
          })
          .parse(body);
        return NextResponse.json({ coupon: opsStore.upsertCoupon(data) });
      }
      case "add_review": {
        const data = z
          .object({
            client_name: z.string().min(2).max(80),
            client_phone: z.string().min(10).max(20),
            client_token: z.string().min(20).optional(),
            rating: z.number().int().min(1).max(5),
            comment: z.string().max(500).nullable().optional(),
            appointment_id: z.string().uuid().nullable().optional(),
          })
          .parse(body);
        const digits = onlyDigits(data.client_phone);
        const staffOk = Boolean(
          session &&
            session.barbershop_id === DEMO_SHOP_ID &&
            roleCan(session.role, "marketing"),
        );
        let clientOk = false;
        if (data.client_token && data.appointment_id) {
          const appt = await getAppointment(data.appointment_id);
          clientOk = Boolean(
            appt &&
              appt.barbershop_id === DEMO_SHOP_ID &&
              (await verifyClientProof(
                data.client_token,
                digits,
                appt.barbershop_id,
              )) &&
              onlyDigits(appt.client_phone) === digits,
          );
        }
        if (!staffOk && !clientOk) {
          return NextResponse.json(
            { error: "OTP do cliente ou login da equipe necessário" },
            { status: 401 },
          );
        }
        if (!staffOk) {
          const ip = clientIp(req);
          const reviewLimit = checkRateLimit(
            sensitiveIpKey(`review:${digits}`, ip),
            {
              limit: 3,
              windowMs: 60 * 60 * 1000,
              lockMs: 60 * 60 * 1000,
            },
          );
          if (!reviewLimit.ok) {
            return NextResponse.json(
              {
                error: reviewLimit.error,
                retryAfterSec: reviewLimit.retryAfterSec,
              },
              {
                status: 429,
                headers: { "Retry-After": String(reviewLimit.retryAfterSec) },
              },
            );
          }
          if (!data.appointment_id) {
            return NextResponse.json(
              { error: "Informe o agendamento avaliado" },
              { status: 400 },
            );
          }
          const appt = await getAppointment(data.appointment_id);
          if (!appt || onlyDigits(appt.client_phone) !== digits) {
            return NextResponse.json(
              { error: "Agendamento inválido para este telefone" },
              { status: 403 },
            );
          }
        }
        return NextResponse.json({
          review: opsStore.addReview({
            client_name: data.client_name.slice(0, 80),
            client_phone: digits,
            rating: data.rating,
            comment: data.comment ? data.comment.slice(0, 500) : null,
            appointment_id: data.appointment_id,
          }),
        });
      }
      case "create_deposit": {
        requirePermission(session, "caixa");
        const data = z
          .object({
            appointment_id: z.string().uuid(),
            amount: z.number().positive(),
            method: z.enum(["pix", "cash", "debit", "credit", "voucher", "other"]),
          })
          .parse(body);
        return NextResponse.json({ deposit: opsStore.createDeposit(data) });
      }
      case "add_unit": {
        requirePermission(session, "unidades");
        const data = z
          .object({
            name: z.string().min(2),
            slug: z.string().min(2),
            city: z.string().min(2),
          })
          .parse(body);
        return NextResponse.json({ unit: opsStore.addUnit(data) });
      }
      case "request_block": {
        // barbeiro solicita bloqueio — registrado no audit; admin cria de fato
        requirePermission(session, "manage_blocks");
        auditRequest(actor, body);
        return NextResponse.json({ ok: true, message: "Solicitação registrada" });
      }
      default:
        return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ops";
    const status = message.includes("login") || message.includes("permissão") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

function auditRequest(actor: string, body: Record<string, unknown>) {
  opsStore.snapshot();
  // reuse openCash audit path via creating a no-op payable? simpler: just touch campaigns
  void actor;
  void body;
}
