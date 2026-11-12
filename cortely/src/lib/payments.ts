import { randomUUID } from "crypto";
import { isDemoMode } from "@/lib/supabase/env";

export type PaymentIntent = {
  id: string;
  amount: number;
  method: "pix" | "credit" | "debit";
  status: "pending" | "paid" | "failed" | "simulated";
  checkout_url: string | null;
  qr_code: string | null;
  provider: "mercadopago" | "asaas" | "simulated";
  created_at: string;
};

/** Provedor indisponível fora do demo — rota deve responder 503. */
export class PaymentProviderUnavailableError extends Error {
  readonly status = 503;
  constructor(message = "Provedor de pagamento indisponível") {
    super(message);
    this.name = "PaymentProviderUnavailableError";
  }
}

/**
 * Cria cobrança.
 * - Com NEXT_PUBLIC_DEMO_MODE=true: Pix simulado (status "simulated") se sem credencial.
 * - Fora do demo: NUNCA devolve QR/status simulado; falha do provedor → 503.
 * (1.B.3-G — provedor real ainda não ligado; P5 aberto.)
 */
export async function createPaymentIntent(input: {
  amount: number;
  description: string;
  customerName?: string;
  customerPhone?: string;
  method?: "pix" | "credit" | "debit";
}): Promise<PaymentIntent> {
  const method = input.method ?? "pix";
  const mp = process.env.MERCADOPAGO_ACCESS_TOKEN;
  const asaas = process.env.ASAAS_API_KEY;
  const demo = isDemoMode();

  if (mp) {
    try {
      const res = await fetch("https://api.mercadopago.com/v1/payments", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${mp}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": randomUUID(),
        },
        body: JSON.stringify({
          transaction_amount: input.amount,
          description: input.description,
          payment_method_id: method === "pix" ? "pix" : "visa",
          payer: {
            email: `${(input.customerPhone || "cliente").replace(/\D/g, "")}@cortely.local`,
          },
        }),
      });
      if (!res.ok) {
        if (demo) {
          /* fall through to simulated */
        } else {
          throw new PaymentProviderUnavailableError(
            "Falha no provedor Mercado Pago",
          );
        }
      } else {
        const json = (await res.json()) as {
          id?: number;
          status?: string;
          point_of_interaction?: { transaction_data?: { qr_code?: string } };
        };
        return {
          id: String(json.id ?? randomUUID()),
          amount: input.amount,
          method,
          status: json.status === "approved" ? "paid" : "pending",
          checkout_url: null,
          qr_code: json.point_of_interaction?.transaction_data?.qr_code ?? null,
          provider: "mercadopago",
          created_at: new Date().toISOString(),
        };
      }
    } catch (e) {
      if (e instanceof PaymentProviderUnavailableError) throw e;
      if (!demo) {
        throw new PaymentProviderUnavailableError(
          "Falha no provedor Mercado Pago",
        );
      }
    }
  }

  if (asaas) {
    try {
      const res = await fetch("https://api.asaas.com/v3/payments", {
        method: "POST",
        headers: {
          access_token: asaas,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          billingType: method === "pix" ? "PIX" : "CREDIT_CARD",
          value: input.amount,
          description: input.description,
          dueDate: new Date().toISOString().slice(0, 10),
        }),
      });
      if (!res.ok) {
        if (!demo) {
          throw new PaymentProviderUnavailableError("Falha no provedor Asaas");
        }
      } else {
        const json = (await res.json()) as {
          id?: string;
          status?: string;
          invoiceUrl?: string;
        };
        return {
          id: json.id ?? randomUUID(),
          amount: input.amount,
          method,
          status: json.status === "RECEIVED" ? "paid" : "pending",
          checkout_url: json.invoiceUrl ?? null,
          qr_code: null,
          provider: "asaas",
          created_at: new Date().toISOString(),
        };
      }
    } catch (e) {
      if (e instanceof PaymentProviderUnavailableError) throw e;
      if (!demo) {
        throw new PaymentProviderUnavailableError("Falha no provedor Asaas");
      }
    }
  }

  if (!demo) {
    throw new PaymentProviderUnavailableError(
      "Nenhum provedor de pagamento configurado",
    );
  }

  return {
    id: randomUUID(),
    amount: input.amount,
    method,
    status: "simulated",
    checkout_url: null,
    qr_code: `00020126580014BR.GOV.BCB.PIX0136${randomUUID()}520400005303986540${input.amount.toFixed(2)}5802BR5925CORTELY BARBEARIA6009SAO PAULO62070503***6304ABCD`,
    provider: "simulated",
    created_at: new Date().toISOString(),
  };
}
