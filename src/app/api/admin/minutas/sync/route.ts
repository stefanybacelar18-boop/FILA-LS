import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessAdmin } from "@/lib/role-permissions";
import { getTodayStartISO } from "@/lib/queue-day";
import { isActiveQueueStatus } from "@/lib/constants";
import {
  enrichQueueWithMinutaMetadata,
  recalculateQueuePrevisoes,
  syncAutoPriorities,
} from "@/lib/minuta-metadata-db";
import { invalidateEnrichedQueueCache } from "@/lib/queue-enrich";
import type { QueueEntry } from "@/lib/types";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Recalcula prioridades e previsões da fila ativa (admin). */
export async function POST() {
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

    const { data: queueRows } = await admin
      .from("queue_entries")
      .select("*")
      .is("deleted_at", null)
      .gte("created_at", getTodayStartISO());

    const enriched = await enrichQueueWithMinutaMetadata(
      admin,
      (queueRows ?? []) as QueueEntry[]
    );
    const active = enriched.filter((e) => isActiveQueueStatus(e.status));

    const [autoPriorities, autoPrevisoes] = await Promise.all([
      syncAutoPriorities(admin, active),
      recalculateQueuePrevisoes(admin, { enriched: active }),
    ]);

    invalidateEnrichedQueueCache();

    return NextResponse.json({ ok: true, autoPriorities, autoPrevisoes });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
