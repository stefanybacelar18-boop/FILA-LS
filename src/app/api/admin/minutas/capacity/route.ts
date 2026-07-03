import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessAdmin } from "@/lib/role-permissions";
import {
  readExpedicaoDiaria,
  saveExpedicaoDiaria,
  recalculateQueuePrevisoes,
  countMinutaMetadata,
  enrichQueueWithMinutaMetadata,
} from "@/lib/minuta-metadata-db";
import { withTimeout } from "@/lib/async-timeout";
import { computeCapacityPlan } from "@/lib/minuta-intelligence";
import { invalidateEnrichedQueueCache } from "@/lib/queue-enrich";
import { mergePrioritiesIntoEntries, readPriorityMap } from "@/lib/queue-priorities";
import { getTodayStartISO } from "@/lib/queue-day";
import { sortQueueEntries } from "@/lib/queue";
import type { QueueEntry } from "@/lib/types";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function GET() {
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

    const [expedicao, queueResult, priorityMap, totalImportadas] = await withTimeout(
      Promise.all([
        readExpedicaoDiaria(admin),
        admin
          .from("queue_entries")
          .select("*")
          .is("deleted_at", null)
          .gte("created_at", getTodayStartISO()),
        readPriorityMap(admin),
        countMinutaMetadata(admin),
      ]),
      20_000,
      "Carregar minutas"
    );

    if (queueResult.error) {
      return NextResponse.json({ error: queueResult.error.message }, { status: 500 });
    }

    const withPriority = mergePrioritiesIntoEntries(
      (queueResult.data ?? []) as QueueEntry[],
      priorityMap
    );
    const enriched = await enrichQueueWithMinutaMetadata(admin, withPriority, {
      priorityMap,
    });
    const sorted = sortQueueEntries(enriched);

    const motosExpedicao = expedicao?.motos ?? 0;
    const plan =
      motosExpedicao > 0 ? computeCapacityPlan(sorted, motosExpedicao) : null;

    return NextResponse.json({
      expedicao,
      plan,
      totalImportadas,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
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

    const body = (await request.json()) as { motos?: number };
    const motos = Math.max(0, Math.round(Number(body.motos) || 0));

    const admin = createAdminClient();
    const { error } = await saveExpedicaoDiaria(admin, motos);

    if (error) {
      return NextResponse.json({ error }, { status: 500 });
    }

    const autoPrevisoes = await recalculateQueuePrevisoes(admin, {
      expedicao: { motos, updated_at: new Date().toISOString() },
    });

    invalidateEnrichedQueueCache();

    return NextResponse.json({ ok: true, motos, autoPrevisoes });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
