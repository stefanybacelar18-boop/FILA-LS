import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getLiveSession,
  requirePermission,
  roleCan,
  verifyClientProof,
} from "@/lib/auth";
import { getAppointment, getShopBundle } from "@/lib/data";
import {
  createPaymentIntent,
  PaymentProviderUnavailableError,
} from "@/lib/payments";
import { opsStore } from "@/lib/ops-store";
import { checkRateLimit, clientIp, sensitiveIpKey } from "@/lib/rate-limit";
import { onlyDigits } from "@/lib/utils";

export async function POST(req: NextRequest) {
  try {
    const session = await getLiveSession(req);
    const body = await req.json();
    const action = z.string().parse(body.action);
    const ip = clientIp(req);

    if (action === "create_intent") {
      const data = z
        .object({
          amount: z.number().positive().max(50_000),
          description: z.string().min(2).max(200),
          customer_name: z.string().max(80).optional(),
          customer_phone: z.string().max(20).optional(),
          method: z.enum(["pix", "credit", "debit"]).optional(),
          appointment_id: z.string().uuid().optional(),
          client_token: z.string().optional(),
          slug: z.string().min(1).optional(),
        })
        .parse(body);

      const staffOk = Boolean(session && roleCan(session.role, "caixa"));
      const phoneDigits = data.customer_phone
        ? onlyDigits(data.customer_phone)
        : "";
      const shopForClient = data.slug
        ? await getShopBundle(data.slug)
        : null;
      const clientOk = Boolean(
        phoneDigits &&
          data.client_token &&
          shopForClient &&
          (await verifyClientProof(
            data.client_token,
            phoneDigits,
            shopForClient.shop.id,
          )),
      );
      if (!staffOk && !clientOk) {
        return NextResponse.json(
          { error: "Login da equipe ou OTP do cliente necessário" },
          { status: 401 },
        );
      }

      if (!staffOk) {
        const payLimit = checkRateLimit(sensitiveIpKey("pay-intent", ip), {
          limit: 8,
          windowMs: 60 * 60 * 1000,
          lockMs: 30 * 60 * 1000,
        });
        if (!payLimit.ok) {
          return NextResponse.json(
            { error: payLimit.error, retryAfterSec: payLimit.retryAfterSec },
            {
              status: 429,
              headers: { "Retry-After": String(payLimit.retryAfterSec) },
            },
          );
        }

        // Cliente só paga sinal vinculado ao próprio agendamento.
        if (!data.appointment_id) {
          return NextResponse.json(
            { error: "Informe o agendamento para pagar o sinal" },
            { status: 400 },
          );
        }
        if (!shopForClient) {
          return NextResponse.json(
            { error: "Informe a barbearia (slug) para pagar o sinal" },
            { status: 400 },
          );
        }
        const appointment = await getAppointment(data.appointment_id);
        if (
          !appointment ||
          onlyDigits(appointment.client_phone) !== phoneDigits ||
          appointment.barbershop_id !== shopForClient.shop.id
        ) {
          return NextResponse.json(
            { error: "Agendamento não encontrado para este telefone" },
            { status: 403 },
          );
        }
        if (appointment.status === "canceled") {
          return NextResponse.json(
            { error: "Agendamento cancelado" },
            { status: 400 },
          );
        }
        const service = shopForClient.services.find(
          (s) => s.id === appointment.service_id,
        );
        const maxAmount = Math.max(service?.price ?? data.amount, 1);
        if (data.amount > maxAmount) {
          return NextResponse.json(
            { error: "Valor acima do serviço agendado" },
            { status: 400 },
          );
        }
      }

      const intent = await createPaymentIntent({
        amount: data.amount,
        description: data.description,
        customerName: data.customer_name,
        customerPhone: data.customer_phone,
        method: data.method,
      });

      // Só registra sinal pago com confirmação real do gateway.
      // Status "simulated" nunca marca depósito como pago.
      if (data.appointment_id && intent.status === "paid" && staffOk) {
        opsStore.createDeposit({
          appointment_id: data.appointment_id,
          amount: data.amount,
          method: data.method ?? "pix",
        });
      }

      return NextResponse.json({ intent });
    }

    if (action === "checkout_sale") {
      requirePermission(session, "caixa");
      const data = z
        .object({
          amount: z.number().positive().max(50_000),
          description: z.string().max(200),
          method: z.enum(["pix", "credit", "debit"]).optional(),
        })
        .parse(body);
      const intent = await createPaymentIntent(data);
      return NextResponse.json({ intent });
    }

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (error) {
    if (error instanceof PaymentProviderUnavailableError) {
      return NextResponse.json(
        { error: error.message },
        { status: 503 },
      );
    }
    const message = error instanceof Error ? error.message : "Erro pagamento";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
