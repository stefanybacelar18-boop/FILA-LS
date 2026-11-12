/**
 * Pipeline webhook 1.B.3-G (D7):
 * assinatura → lookup intent → quarentena | ops_apply_payment_webhook.
 * Tenant SEMPRE da intent. Sem efeito de negócio.
 * Resposta HTTP mínima: {ok:true} | {ok:false,error} — detalhes só em log.
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
  body: { ok: true } | { ok: false; error: string };
};

function okTrue(status = 200): WebhookHandlerResult {
  return { httpStatus: status, body: { ok: true } };
}

function okFalse(status: number, error: string): WebhookHandlerResult {
  return { httpStatus: status, body: { ok: false, error } };
}

function logWebhook(detail: Record<string, unknown>) {
  console.info("cortely payment-webhook", JSON.stringify(detail));
}

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
  const env = opts.env ?? process.env;

  if (!opts.paymentIntentsIsPostgres) {
    logWebhook({ event: "registry_not_postgres" });
    return okFalse(
      503,
      "payment_intents não está em postgres (gateway isolado off)",
    );
  }

  if (Buffer.byteLength(opts.rawBody, "utf8") > MAX_WEBHOOK_BODY_BYTES) {
    return okFalse(413, "payload too large");
  }

  const provider = resolveProvider(opts.providerName, env);
  if (!provider) {
    logWebhook({
      event: "provider_unknown",
      provider: opts.providerName,
    });
    return okFalse(404, "provider unknown");
  }

  // 1) Assinatura ANTES de qualquer escrita — corpo bruto
  const sigOk = provider.verifyWebhook(opts.headers, opts.rawBody);
  if (!sigOk) {
    logWebhook({ event: "invalid_signature", provider: provider.name });
    return okFalse(401, "invalid signature");
  }

  let parsed;
  try {
    parsed = provider.parseEvent(opts.rawBody);
  } catch (err) {
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
    logWebhook({
      event: "quarantined",
      reason: "schema_invalid",
      detail: err instanceof Error ? err.message : String(err),
    });
    return okTrue(202);
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
    logWebhook({
      event: "quarantined",
      reason: "intent_missing",
      provider_event_id: parsed.provider_event_id,
    });
    return okTrue(202);
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
  logWebhook({
    event: "applied",
    result: row?.result ?? "processed",
    intent_id: row?.intent_id ?? intent.id,
    barbershop_id: row?.barbershop_id ?? intent.barbershop_id,
    intent_status: row?.intent_status ?? intent.status,
    ignored_claimed_barbershop_id: parsed.claimed_barbershop_id ?? null,
  });

  if (row?.result?.startsWith("quarantined")) {
    return okTrue(202);
  }
  return okTrue(200);
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
