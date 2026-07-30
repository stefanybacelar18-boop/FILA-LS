import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessAdmin } from "@/lib/role-permissions";
import { fetchGoogleFormSheetRows } from "@/lib/google-form-sheet-pull";
import { upsertGoogleFormRows } from "@/lib/google-form-upsert";
import { invalidateEnrichedQueueCache } from "@/lib/queue-enrich";
import { rateLimitAllow, rateLimitRetryAfterSec } from "@/lib/rate-limit";
import {
  GOOGLE_FORM_SYNC_DISABLED_MESSAGE,
  isGoogleFormSyncEnabled,
} from "@/lib/google-form-feature";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

function disabledResponse() {
  return NextResponse.json(
    { error: "disabled", message: GOOGLE_FORM_SYNC_DISABLED_MESSAGE },
    { status: 410 }
  );
}

/** Importa / atualiza todas as linhas da planilha Google Form (admin). */
export async function POST() {
  if (!isGoogleFormSyncEnabled()) {
    return disabledResponse();
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile?.role || !canAccessAdmin(profile.role)) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const rateKey = `google-form-admin-sync:${user.id}`;
    if (!rateLimitAllow(rateKey, 6, 10 * 60_000)) {
      return NextResponse.json(
        { error: "rate_limit", message: "Aguarde antes de sincronizar novamente." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimitRetryAfterSec(rateKey, 10 * 60_000)) },
        }
      );
    }

    const pulled = await fetchGoogleFormSheetRows();
    if (!pulled.ok) {
      return NextResponse.json({ error: pulled.error }, { status: 502 });
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

    const stats = await upsertGoogleFormRows(admin, pulled.rows);

    if (stats.created + stats.updated > 0) {
      invalidateEnrichedQueueCache();
    }

    await admin.from("settings").upsert(
      {
        key: "google_form_last_sync",
        value: {
          at: new Date().toISOString(),
          ...stats,
        },
      },
      { onConflict: "key" }
    );

    return NextResponse.json({ ok: true, ...stats });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  if (!isGoogleFormSyncEnabled()) {
    return NextResponse.json({
      ok: true,
      enabled: false,
      message: GOOGLE_FORM_SYNC_DISABLED_MESSAGE,
      webhookConfigured: false,
      rowsInSheet: null,
      lastSync: null,
      sheetError: null,
    });
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile?.role || !canAccessAdmin(profile.role)) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data } = await admin
      .from("settings")
      .select("value")
      .eq("key", "google_form_last_sync")
      .maybeSingle();

    const pulled = await fetchGoogleFormSheetRows();
    const rowCount = pulled.ok ? pulled.totalInSheet : null;

    return NextResponse.json({
      ok: true,
      enabled: true,
      webhookConfigured: Boolean(process.env.GOOGLE_FORM_WEBHOOK_SECRET?.trim()),
      rowsInSheet: rowCount,
      lastSync: data?.value ?? null,
      sheetError: pulled.ok ? null : pulled.error,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
