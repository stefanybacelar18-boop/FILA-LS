import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getRequestSession,
  parseClientProof,
  requirePermission,
  roleCan,
} from "@/lib/auth";
import { createPaymentIntent } from "@/lib/payments";
import { opsStore } from "@/lib/ops-store";
import { onlyDigits } from "@/lib/utils";

export async function POST(req: NextRequest) {
  try {
    const session = getRequestSession(req);
    const body = await req.json();
    const action = z.string().parse(body.action);

    if (action === "create_intent") {
      const data = z
        .object({
          amount: z.number().positive(),
          description: z.string().min(2),
          customer_name: z.string().optional(),
          customer_phone: z.string().optional(),
          method: z.enum(["pix", "credit", "debit"]).optional(),
          appointment_id: z.string().uuid().optional(),
          client_token: z.string().optional(),
        })
        .parse(body);

      const staffOk = Boolean(session && roleCan(session.role, "caixa"));
      const phoneDigits = data.customer_phone
        ? onlyDigits(data.customer_phone)
        : "";
      const clientOk = Boolean(
        phoneDigits &&
          data.client_token &&
          parseClientProof(data.client_token, phoneDigits),
      );
      if (!staffOk && !clientOk) {
        return NextResponse.json(
          { error: "Login da equipe ou OTP do cliente necessário" },
          { status: 401 },
        );
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
          amount: z.number().positive(),
          description: z.string(),
          method: z.enum(["pix", "credit", "debit"]).optional(),
        })
        .parse(body);
      const intent = await createPaymentIntent(data);
      return NextResponse.json({ intent });
    }

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro pagamento";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
