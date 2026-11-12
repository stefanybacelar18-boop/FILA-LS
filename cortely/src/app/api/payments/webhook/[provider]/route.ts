/**
 * POST /api/payments/webhook/[provider] — 1.B.3-G gateway isolado.
 * Assinatura → lookup intent → quarentena | apply. Sem efeito de negócio.
 * Se payment_intents != postgres → 503 zero escrita (caso da produção hoje).
 */
import { NextRequest, NextResponse } from "next/server";
import {
  getCachedRegistrySnapshot,
  bundledRegistrySeedText,
  loadRegistry,
  sourceOf,
} from "@/lib/ops-registry";
import { getGatewayDb } from "@/lib/payments/gateway-db";
import {
  handlePaymentWebhook,
  MAX_WEBHOOK_BODY_BYTES,
} from "@/lib/payments/webhook-handler";
import { checkRateLimit, clientIp, sensitiveIpKey } from "@/lib/rate-limit";

export const runtime = "nodejs";

function paymentIntentsIsPostgres(): boolean {
  const cached = getCachedRegistrySnapshot();
  const snap =
    cached ??
    loadRegistry({
      tableExists: false,
      fileContents: bundledRegistrySeedText(),
    });
  return sourceOf(snap, "payment_intents") === "postgres";
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ provider: string }> | { provider: string } },
) {
  const ip = clientIp(req);
  const rl = checkRateLimit(sensitiveIpKey("pay-webhook", ip), {
    limit: 120,
    windowMs: 60 * 1000,
    lockMs: 5 * 60 * 1000,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: rl.error },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSec) },
      },
    );
  }

  const contentLength = Number(req.headers.get("content-length") || "0");
  if (contentLength > MAX_WEBHOOK_BODY_BYTES) {
    return NextResponse.json(
      { ok: false, error: "payload too large" },
      { status: 413 },
    );
  }

  const rawBody = await req.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BODY_BYTES) {
    return NextResponse.json(
      { ok: false, error: "payload too large" },
      { status: 413 },
    );
  }

  const params = await Promise.resolve(ctx.params);
  const provider = String(params.provider || "");

  if (!paymentIntentsIsPostgres()) {
    return NextResponse.json(
      {
        ok: false,
        error: "payment_intents não está em postgres (gateway isolado off)",
      },
      { status: 503 },
    );
  }

  const db = await getGatewayDb();
  if (!db) {
    return NextResponse.json(
      { ok: false, error: "gateway database unavailable" },
      { status: 503 },
    );
  }

  const result = await handlePaymentWebhook({
    providerName: provider,
    headers: req.headers,
    rawBody,
    db,
    paymentIntentsIsPostgres: true,
  });

  return NextResponse.json(result.body, { status: result.httpStatus });
}
