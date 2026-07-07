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
import { ACTIVE_QUEUE_DB_STATUSES } from "@/lib/constants";
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
          .in("status", [...ACTIVE_QUEUE_DB_STATUSES]),
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

    const motosExpedicao = expedicao?.capacidade_estoque ?? 0;
    const plan =
      motosExpedicao > 0 && expedicao
        ? computeCapacityPlan(sorted, expedicao)
        : null;

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

    const body = (await request.json()) as {
      capacidade_estoque?: number;
      expedicao?: number;
      motos_no_estoque?: number;
      /** Legado: um único campo preenchia os dois valores. */
      motos?: number;
    };

    const legacyMotos =
      body.motos != null ? Math.max(0, Math.round(Number(body.motos) || 0)) : null;
    const capacidade_estoque = Math.max(
      0,
      Math.round(
        Number(body.capacidade_estoque ?? legacyMotos ?? 0) || 0
      )
    );
    const expedicao = Math.max(
      0,
      Math.round(Number(body.expedicao ?? legacyMotos ?? 0) || 0)
    );
    const motos_no_estoque = Math.max(0, capacidade_estoque - expedicao);

    if (capacidade_estoque <= 0) {
      return NextResponse.json(
        { error: "Informe a capacidade do estoque cheio (ex.: 950)." },
        { status: 400 }
      );
    }

    if (expedicao > capacidade_estoque) {
      return NextResponse.json(
        {
          error:
            "Motos expedidas não pode ser maior que a capacidade do estoque cheio.",
        },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const { error } = await saveExpedicaoDiaria(admin, {
      capacidade_estoque,
      expedicao,
      motos_no_estoque,
    });

    if (error) {
      return NextResponse.json({ error }, { status: 500 });
    }

    const savedConfig = {
      capacidade_estoque,
      expedicao,
      motos_no_estoque,
      updated_at: new Date().toISOString(),
    };
    const autoPrevisoes = await recalculateQueuePrevisoes(admin, {
      expedicao: savedConfig,
    });

    invalidateEnrichedQueueCache();

    return NextResponse.json({
      ok: true,
      capacidade_estoque,
      expedicao,
      motos_no_estoque,
      autoPrevisoes,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
