import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isStaffRole } from "@/lib/auth-profile";
import {
  invalidateEnrichedQueueCache,
  loadBasicOperationalQueue,
  loadEnrichedQueueEntries,
} from "@/lib/queue-enrich";
import { toMotoristaQueueEntry, toPublicQueueEntries } from "@/lib/queue-public-dto";
import {
  computePublicQueueStats,
  loadFinalizadosHojeForStats,
} from "@/lib/public-queue-stats";
import { withTimeout } from "@/lib/async-timeout";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const LOAD_TIMEOUT_MS = 18_000;

/** Fila operacional enriquecida — escopo conforme autenticação */
export async function GET(request: NextRequest) {
  try {
    const bustCache = request.nextUrl.searchParams.has("_");
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let scope: "public" | "motorista" | "staff" = "public";

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.role === "motorista") scope = "motorista";
      else if (profile?.role && isStaffRole(profile.role)) scope = "staff";
    }

    const admin = createAdminClient();
    let entries;
    let fallback = false;

    try {
      entries = await withTimeout(
        loadEnrichedQueueEntries(admin, { bypassCache: bustCache }),
        LOAD_TIMEOUT_MS,
        "Carregar fila"
      );
    } catch (err) {
      invalidateEnrichedQueueCache();
      console.warn("[queue/operational] enrich fallback:", err);
      entries = await withTimeout(
        loadBasicOperationalQueue(admin),
        10_000,
        "Carregar fila básica"
      );
      fallback = true;
    }

    const data =
      scope === "staff"
        ? entries
        : scope === "motorista"
          ? entries.map((e) => toMotoristaQueueEntry(e))
          : toPublicQueueEntries(entries);

    const meta: {
      scope: string;
      fallback: boolean;
      visibility: typeof scope;
      stats?: ReturnType<typeof computePublicQueueStats>;
    } = { scope: "operational_active", fallback, visibility: scope };

    if (scope === "public") {
      const finalizadosHoje = await loadFinalizadosHojeForStats(admin);
      meta.stats = computePublicQueueStats(entries, finalizadosHoje);
    }

    return NextResponse.json(
      {
        data,
        meta,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (err) {
    invalidateEnrichedQueueCache();
    console.error("[queue/operational]", err);
    return NextResponse.json({ error: "Não foi possível carregar a fila." }, { status: 500 });
  }
}
