/**
 * FakeProvider — HMAC-SHA256 com segredo de teste (só testes/CI/demo explícito).
 * Sem chamadas externas. Sem segredo padrão embutido.
 */
import { createHmac, timingSafeEqual } from "crypto";
import type {
  CreateChargeResult,
  ParsedWebhookEvent,
  PaymentProvider,
  ProviderAccount,
  PaymentIntentRecord,
} from "./types";

export const FAKE_PROVIDER_NAME = "fake";

export class FakePaymentBootError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FakePaymentBootError";
  }
}

/** Flag + (NODE_ENV=test OU demo). Sem isso, "fake"/"test" não existem. */
export function isFakePaymentProviderAllowed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (String(env.CORTELY_ENABLE_FAKE_PAYMENT_PROVIDER || "").trim() !== "true") {
    return false;
  }
  if (env.NODE_ENV === "test") return true;
  if (String(env.NEXT_PUBLIC_DEMO_MODE || "").trim() === "true") return true;
  return false;
}

/**
 * Produção (NODE_ENV=production, sem demo) + flag fake → fail-fast no boot.
 */
export function assertFakePaymentProviderSafeAtBoot(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (String(env.CORTELY_ENABLE_FAKE_PAYMENT_PROVIDER || "").trim() !== "true") {
    return;
  }
  const isProd = env.NODE_ENV === "production";
  const isDemo = String(env.NEXT_PUBLIC_DEMO_MODE || "").trim() === "true";
  if (isProd && !isDemo) {
    throw new FakePaymentBootError(
      "cortely fail-fast: CORTELY_ENABLE_FAKE_PAYMENT_PROVIDER=true em produção (sem demo)",
    );
  }
}

export function fakeSign(rawBody: string | Buffer, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

function headerGet(
  headers: Headers | Record<string, string>,
  name: string,
): string | null {
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name);
  }
  const obj = headers as Record<string, string>;
  const found = Object.entries(obj).find(
    ([k]) => k.toLowerCase() === name.toLowerCase(),
  );
  return found ? found[1] : null;
}

export class FakeProvider implements PaymentProvider {
  readonly name = FAKE_PROVIDER_NAME;

  constructor(private readonly secret: string) {
    if (!secret || secret.length < 8) {
      throw new Error("FakeProvider: CORTELY_FAKE_PAYMENT_SECRET obrigatório (≥8 chars)");
    }
  }

  async createCharge(
    intent: Pick<PaymentIntentRecord, "id" | "amount" | "method" | "purpose">,
    account: ProviderAccount,
  ): Promise<CreateChargeResult> {
    const ref = `fake_${intent.id.replace(/-/g, "").slice(0, 16)}_${account.external_account_id.slice(0, 8)}`;
    return {
      provider_ref: ref,
      checkout_url: null,
      qr_code: intent.method === "pix" ? `FAKEPIX:${ref}:${intent.amount}` : null,
      status: "pending",
    };
  }

  /**
   * Assinatura: header `x-cortely-fake-signature` = hex(HMAC-SHA256(secret, rawBody)).
   * Comparação em tempo constante no corpo bruto.
   */
  verifyWebhook(
    headers: Headers | Record<string, string>,
    rawBody: string | Buffer,
  ): boolean {
    const provided = headerGet(headers, "x-cortely-fake-signature");
    if (!provided) return false;
    const expected = fakeSign(rawBody, this.secret);
    try {
      const a = Buffer.from(provided, "utf8");
      const b = Buffer.from(expected, "utf8");
      if (a.length !== b.length) return false;
      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  parseEvent(rawBody: string | Buffer): ParsedWebhookEvent {
    const text =
      typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
    const json = JSON.parse(text) as Record<string, unknown>;
    const provider_event_id = String(json.provider_event_id || "");
    const provider_ref = String(json.provider_ref || "");
    const status = String(json.status || "");
    const amount = Number(json.amount);
    if (!provider_event_id || !provider_ref) {
      throw new Error("SCHEMA_INVALID: provider_event_id/provider_ref");
    }
    if (!["pending", "paid", "failed", "canceled"].includes(status)) {
      throw new Error("SCHEMA_INVALID: status");
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("SCHEMA_INVALID: amount");
    }
    return {
      provider_event_id,
      provider_ref,
      status: status as ParsedWebhookEvent["status"],
      amount,
      claimed_barbershop_id:
        json.barbershop_id == null ? null : String(json.barbershop_id),
    };
  }
}

/** null se flag off, ambiente inválido ou sem CORTELY_FAKE_PAYMENT_SECRET. */
export function createFakeProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): FakeProvider | null {
  if (!isFakePaymentProviderAllowed(env)) return null;
  const secret = env.CORTELY_FAKE_PAYMENT_SECRET?.trim();
  if (!secret) return null;
  return new FakeProvider(secret);
}
