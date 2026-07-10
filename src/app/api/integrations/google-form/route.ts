import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { upsertGoogleFormRow } from "@/lib/google-form-upsert";
import type { GoogleFormRowPayload } from "@/lib/google-form-sync";
import { invalidateEnrichedQueueCache } from "@/lib/queue-enrich";
import { rateLimitAllow, rateLimitRetryAfterSec } from "@/lib/rate-limit";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

type WebhookBody = {
  event?: "form_submit" | "sheet_edit" | "sheet_sync" | "backfill";
  row?: GoogleFormRowPayload;
  secret?: string;
};

function normalizeSecret(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/^["']|["']$/g, "");
}

function secretsMatch(provided: string | null | undefined, expected: string): boolean {
  const a = normalizeSecret(provided);
  const b = normalizeSecret(expected);
  return a.length > 0 && a === b;
}

function verifySecret(request: NextRequest, bodySecret?: string | null): boolean {
  const expected = normalizeSecret(process.env.GOOGLE_FORM_WEBHOOK_SECRET);
  if (!expected) return false;

  if (secretsMatch(request.headers.get("x-google-form-secret"), expected)) return true;

  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ") && secretsMatch(auth.slice(7), expected)) return true;

  if (secretsMatch(bodySecret, expected)) return true;

  return false;
}

export async function POST(request: NextRequest) {
  if (!normalizeSecret(process.env.GOOGLE_FORM_WEBHOOK_SECRET)) {
    return NextResponse.json(
      { error: "GOOGLE_FORM_WEBHOOK_SECRET não configurado no servidor." },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => null)) as WebhookBody | null;

  if (!verifySecret(request, body?.secret)) {
    return NextResponse.json(
      {
        error: "Não autorizado",
        hint: "FILADOCK_WEBHOOK_SECRET na planilha deve ser igual a GOOGLE_FORM_WEBHOOK_SECRET na Vercel (mesmo valor, sem espaços).",
      },
      { status: 401 }
    );
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "google-form";

  const rateKey = `google-form-webhook:${ip}`;
  if (!rateLimitAllow(rateKey, 120, 60_000)) {
    return NextResponse.json(
      { error: "rate_limit" },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimitRetryAfterSec(rateKey, 60_000)) },
      }
    );
  }

  if (!body?.row) {
    return NextResponse.json({ error: "Campo row obrigatório." }, { status: 400 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json(
      { error: "Servidor sem credencial admin (SUPABASE_SERVICE_ROLE_KEY)." },
      { status: 500 }
    );
  }

  const result = await upsertGoogleFormRow(admin, body.row);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  if (result.action === "created" || result.action === "updated") {
    invalidateEnrichedQueueCache();
  }

  return NextResponse.json({
    ok: true,
    action: result.action,
    event: body.event ?? "form_submit",
    entryId: "entryId" in result ? result.entryId : undefined,
    token: "token" in result ? result.token : undefined,
    rowId: result.rowId,
    status: result.status,
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "google-form-webhook",
    configured: Boolean(process.env.GOOGLE_FORM_WEBHOOK_SECRET?.trim()),
  });
}
