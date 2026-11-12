/**
 * Pipeline webhook 1.B.3-G (D7):
 * assinatura → lookup intent → quarentena | ops_apply_payment_webhook.
 * Tenant SEMPRE da intent. Sem efeito de negócio.
 */
import type { PaymentProvider } from "./types";
import type { PgQueryable } from "./pg";
import {
  FAKE_PROVIDER_NAME,
  createFakeProviderFromEnv,
} from "./fake-provider";

export const MAX_WEBHOOK_BODY_BYTES = 64 * 1024;

export type WebhookHandlerResult = {
  httpStatus: number;
  body: Record<string, unknown>;
};

export function resolveProvider(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
): PaymentProvider | null {
  const key = name.toLowerCase();
  if (key === FAKE_PROVIDER_NAME || key === "test") {
    return createFakeProviderFromEnv(env);
  }
  return null;
}

export async function handlePaymentWebhook(opts: {
  providerName: string;
  headers: Headers | Record<string, string>;
  rawBody: string;
  db: PgQueryable;
  /** Se false → 503 sem escrita (produção json). */
  paymentIntentsIsPostgres: boolean;
  env?: NodeJS.ProcessEnv;
}): Promise<WebhookHandlerResult> {
  if (!opts.paymentIntentsIsPostgres) {
    return {
      httpStatus: 503,
      body: {
        error: "payment_intents não está em postgres (gateway isolado off)",
      },
    };
  }

  if (Buffer.byteLength(opts.rawBody, "utf8") > MAX_WEBHOOK_BODY_BYTES) {
    return { httpStatus: 413, body: { error: "payload too large" } };
  }

  const provider = resolveProvider(opts.providerName, opts.env);
  if (!provider) {
    return { httpStatus: 404, body: { error: "provider unknown" } };
  }

  // 1) Assinatura ANTES de qualquer escrita — corpo bruto
  const ok = provider.verifyWebhook(opts.headers, opts.rawBody);
  if (!ok) {
    return { httpStatus: 401, body: { error: "invalid signature" } };
  }

  let parsed;
  try {
    parsed = provider.parseEvent(opts.rawBody);
  } catch {
    const rawJson = safeJson(opts.rawBody);
    await opts.db.query(
      `SELECT * FROM public.ops_quarantine_payment_webhook($1,$2,$3::jsonb,$4,$5)`,
      [
        provider.name,
        extractEventId(rawJson),
        JSON.stringify(rawJson),
        "schema_invalid",
        true,
      ],
    );
    return {
      httpStatus: 202,
      body: { result: "quarantined", reason: "schema_invalid" },
    };
  }

  // Lookup intent por (provider, provider_ref) — tenant da intent
  const intentRes = await opts.db.query<{
    id: string;
    barbershop_id: string;
    amount: string | number;
    status: string;
  }>(
    `SELECT id, barbershop_id, amount, status
     FROM public.payment_intents
     WHERE provider = $1 AND provider_ref = $2`,
    [provider.name, parsed.provider_ref],
  );
  const intent = intentRes.rows[0];

  if (!intent) {
    await opts.db.query(
      `SELECT * FROM public.ops_quarantine_payment_webhook($1,$2,$3::jsonb,$4,$5)`,
      [
        provider.name,
        parsed.provider_event_id,
        opts.rawBody,
        "intent_missing",
        true,
      ],
    );
    return {
      httpStatus: 202,
      body: { result: "quarantined", reason: "intent_missing" },
    };
  }

  // Payload pode alegar outro barbershop — ignorado (tenant = intent)
  const apply = await opts.db.query<{
    result: string;
    intent_id: string;
    barbershop_id: string;
    intent_status: string;
  }>(
    `SELECT * FROM public.ops_apply_payment_webhook($1,$2,$3,$4,$5,$6::jsonb,$7)`,
    [
      provider.name,
      parsed.provider_event_id,
      parsed.provider_ref,
      parsed.status,
      parsed.amount,
      opts.rawBody,
      true,
    ],
  );
  const row = apply.rows[0];
  return {
    httpStatus: 200,
    body: {
      result: row?.result ?? "processed",
      intent_id: row?.intent_id ?? intent.id,
      barbershop_id: row?.barbershop_id ?? intent.barbershop_id,
      intent_status: row?.intent_status ?? intent.status,
      // claimed tenant no payload é ignorado de propósito
      ignored_claimed_barbershop_id: parsed.claimed_barbershop_id ?? null,
    },
  };
}

export async function reprocessQuarantine(
  db: PgQueryable,
  quarantineId: string,
) {
  const res = await db.query(
    `SELECT * FROM public.ops_reprocess_payment_quarantine($1)`,
    [quarantineId],
  );
  return res.rows[0] ?? null;
}

function safeJson(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : { raw };
  } catch {
    return { raw };
  }
}

function extractEventId(json: Record<string, unknown>): string | null {
  const id = json.provider_event_id;
  return id == null || id === "" ? null : String(id);
}
