import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { upsertGoogleFormRow } from "@/lib/google-form-upsert";
import type { GoogleFormRowPayload } from "@/lib/google-form-sync";
import { invalidateEnrichedQueueCache } from "@/lib/queue-enrich";
import { rateLimitAllow, rateLimitRetryAfterSec } from "@/lib/rate-limit";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

type WebhookBody = {
  event?: "form_submit" | "sheet_edit";
  row?: GoogleFormRowPayload;
};

function verifySecret(request: NextRequest): boolean {
  const expected = process.env.GOOGLE_FORM_WEBHOOK_SECRET?.trim();
  if (!expected) return false;

  const header = request.headers.get("x-google-form-secret")?.trim();
  if (header && header === expected) return true;

  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ") && auth.slice(7).trim() === expected) return true;

  return false;
}

export async function POST(request: NextRequest) {
  if (!process.env.GOOGLE_FORM_WEBHOOK_SECRET?.trim()) {
    return NextResponse.json(
      { error: "GOOGLE_FORM_WEBHOOK_SECRET não configurado no servidor." },
      { status: 503 }
    );
  }

  if (!verifySecret(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
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

  const body = (await request.json().catch(() => null)) as WebhookBody | null;
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
