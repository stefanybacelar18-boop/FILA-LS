import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isStaffQueueRole } from "@/lib/role-permissions";
import { loadEnrichedQueueEntries } from "@/lib/queue-enrich";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
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

    if (!profile?.role || !isStaffQueueRole(profile.role)) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const admin = createAdminClient();
    const scope = request.nextUrl.searchParams.get("scope");
    const includeInactive = scope === "all";
    const entries = await loadEnrichedQueueEntries(admin, {
      includeInactive,
      bypassCache: request.nextUrl.searchParams.has("_"),
    });

    return NextResponse.json(
      {
        data: entries,
        meta: {
          scope: includeInactive ? "active_plus_closed_today" : "operational_active",
          count: entries.length,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
