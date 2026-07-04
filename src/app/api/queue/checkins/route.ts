import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessAdmin } from "@/lib/role-permissions";
import { enrichEntriesWithFinishedAt } from "@/lib/queue-finished-at";
import { buildCheckinsExcelCsv } from "@/lib/export-checkins";
import type { QueueEntry } from "@/lib/types";

const DEFAULT_LIMIT = 300;
const MAX_LIMIT = 500;
const EXPORT_LIMIT = 2000;

function escapeIlike(term: string): string {
  return term.replace(/[%_\\]/g, "\\$&");
}

async function loadCheckins(
  admin: ReturnType<typeof createAdminClient>,
  params: {
    status?: string | null;
    q?: string;
    from?: string | null;
    to?: string | null;
    limit: number;
  }
): Promise<QueueEntry[]> {
  let query = admin
    .from("queue_entries")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(params.limit);

  if (params.from) query = query.gte("created_at", params.from);
  if (params.to) query = query.lte("created_at", params.to);
  if (params.status && params.status !== "all") query = query.eq("status", params.status);

  if (params.q) {
    const term = escapeIlike(params.q);
    query = query.or(
      `minuta.ilike.%${term}%,placa_cavalo.ilike.%${term}%,placa.ilike.%${term}%,nome.ilike.%${term}%,transportadora.ilike.%${term}%`
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return enrichEntriesWithFinishedAt(admin, (data ?? []) as QueueEntry[]);
}

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

    if (!profile?.role || !canAccessAdmin(profile.role)) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const params = request.nextUrl.searchParams;
    const isExport = params.get("export") === "excel";
    const limit = isExport
      ? EXPORT_LIMIT
      : Math.min(parseInt(params.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, MAX_LIMIT);

    const admin = createAdminClient();
    const entries = await loadCheckins(admin, {
      status: params.get("status"),
      q: params.get("q")?.trim().toLowerCase(),
      from: params.get("from"),
      to: params.get("to"),
      limit,
    });

    if (isExport) {
      const csv = buildCheckinsExcelCsv(entries);
      const stamp = new Date().toISOString().slice(0, 10);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="checkins-filadock-${stamp}.csv"`,
        },
      });
    }

    return NextResponse.json({ data: entries, count: entries.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
