import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchGoogleFormSheetRows } from "@/lib/google-form-sheet-pull";
import { upsertGoogleFormRows } from "@/lib/google-form-upsert";
import { invalidateEnrichedQueueCache } from "@/lib/queue-enrich";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

function verifyCronSecret(request: NextRequest): boolean {
  const expected =
    process.env.CRON_SECRET?.trim() || process.env.GOOGLE_FORM_WEBHOOK_SECRET?.trim();
  if (!expected) return false;

  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${expected}`) return true;

  return request.headers.get("x-cron-secret")?.trim() === expected;
}

/** Backup: sincroniza planilha → fila a cada poucos minutos (Vercel Cron). */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const pulled = await fetchGoogleFormSheetRows();
  if (!pulled.ok) {
    return NextResponse.json({ error: pulled.error }, { status: 502 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Servidor sem credencial admin." }, { status: 500 });
  }

  const stats = await upsertGoogleFormRows(admin, pulled.rows);

  if (stats.created + stats.updated > 0) {
    invalidateEnrichedQueueCache();
  }

  await admin.from("settings").upsert(
    {
      key: "google_form_last_sync",
      value: {
        at: new Date().toISOString(),
        source: "cron",
        ...stats,
      },
    },
    { onConflict: "key" }
  );

  return NextResponse.json({ ok: true, ...stats });
}
