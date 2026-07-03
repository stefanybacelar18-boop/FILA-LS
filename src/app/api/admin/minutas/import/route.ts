import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessAdmin } from "@/lib/role-permissions";
import {
  normalizeMinutaKey,
  parseImportMatrix,
  type MinutaMetadata,
} from "@/lib/minuta-intelligence";
import {
  enrichQueueWithMinutaMetadata,
  syncAutoPriorities,
  upsertMinutaMetadataBatch,
  recalculateQueuePrevisoes,
} from "@/lib/minuta-metadata-db";
import { ACTIVE_QUEUE_DB_STATUSES } from "@/lib/constants";
import { isActiveQueueStatus } from "@/lib/constants";
import { invalidateEnrichedQueueCache } from "@/lib/queue-enrich";
import type { QueueEntry } from "@/lib/types";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
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

    const form = await request.formData();
    const file = form.get("file");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: "Envie um arquivo Excel (.xlsx, .xls) ou CSV." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheetName = workbook.SheetNames[0];

    if (!sheetName) {
      return NextResponse.json({ error: "Planilha vazia." }, { status: 400 });
    }

    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      raw: true,
    }) as unknown[][];

    if (matrix.length < 2) {
      return NextResponse.json(
        { error: "A planilha precisa ter cabeçalho e ao menos uma linha." },
        { status: 400 }
      );
    }

    const headerRow = matrix[0].map((c) => String(c ?? "").trim());
    const { records, format, skippedRows } = parseImportMatrix(matrix);
    const parsed: MinutaMetadata[] = records.map((r) => ({
      minuta: r.minuta,
      volume_motos: r.volume_motos,
      menor_vencimento: r.menor_vencimento,
    }));

    if (parsed.length === 0) {
      return NextResponse.json(
        {
          error:
            "Nenhuma minuta válida encontrada. Use o Excel ConsultaGeralMotos ou colunas: MINUTA, volume e vencimento.",
          format,
          headers: headerRow,
        },
        { status: 400 }
      );
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

    const { upserted, error: upsertError } = await upsertMinutaMetadataBatch(admin, parsed);

    if (upsertError) {
      const missingTable = /minuta_metadata|does not exist/i.test(upsertError);
      return NextResponse.json(
        {
          error: missingTable
            ? "Tabela minuta_metadata não existe. Rode supabase/migracao-minuta-inteligente.sql no Supabase."
            : upsertError,
        },
        { status: 500 }
      );
    }

    const { data: queueRows } = await admin
      .from("queue_entries")
      .select("*")
      .is("deleted_at", null)
      .in("status", [...ACTIVE_QUEUE_DB_STATUSES]);

    const queueEntries = (queueRows ?? []) as QueueEntry[];
    const enriched = await enrichQueueWithMinutaMetadata(admin, queueEntries);
    const activeEnriched = enriched.filter((e) => isActiveQueueStatus(e.status));

    const [autoPriorities, autoPrevisoes] = await Promise.all([
      syncAutoPriorities(admin, activeEnriched),
      recalculateQueuePrevisoes(admin, { enriched: activeEnriched }),
    ]);

    invalidateEnrichedQueueCache();

    const matchedInQueue = activeEnriched.filter((e) =>
      parsed.some((p) => normalizeMinutaKey(p.minuta) === normalizeMinutaKey(e.minuta))
    ).length;

    return NextResponse.json({
      ok: true,
      imported: upserted,
      format,
      totalMotos: parsed.reduce((s, p) => s + p.volume_motos, 0),
      skipped: skippedRows,
      matchedInQueue,
      autoPriorities,
      autoPrevisoes,
      headers: headerRow,
      preview: parsed.slice(0, 5).map((p) => ({
        minuta: p.minuta,
        volume_motos: p.volume_motos,
        menor_vencimento: p.menor_vencimento,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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
    const { data, error } = await admin
      .from("minuta_metadata")
      .select("minuta,volume_motos,menor_vencimento,updated_at")
      .order("updated_at", { ascending: false })
      .limit(500);

    if (error) {
      return NextResponse.json(
        {
          error: /minuta_metadata|does not exist/i.test(error.message)
            ? "Rode supabase/migracao-minuta-inteligente.sql no Supabase."
            : error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
