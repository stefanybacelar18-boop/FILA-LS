import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildGoogleFormInsertPayload,
  buildGoogleFormUpdatePayload,
  parseGoogleFormRow,
  type GoogleFormRowPayload,
  type ParsedGoogleFormRow,
} from "./google-form-sync";
import { insertQueueEntry, updateQueueEntryFields } from "./queue-db";

export type GoogleFormUpsertResult =
  | { ok: true; action: "created"; entryId: string; token: string; rowId: string; status: string }
  | { ok: true; action: "updated"; entryId: string; token: string; rowId: string; status: string }
  | { ok: true; action: "unchanged"; rowId: string; status: string }
  | { ok: false; error: string; rowId?: string };

export async function upsertGoogleFormRow(
  admin: SupabaseClient,
  row: GoogleFormRowPayload
): Promise<GoogleFormUpsertResult> {
  const parsed = parseGoogleFormRow(row);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  return upsertParsedGoogleFormRow(admin, parsed.data);
}

export async function upsertParsedGoogleFormRow(
  admin: SupabaseClient,
  parsed: ParsedGoogleFormRow
): Promise<GoogleFormUpsertResult> {
  const { data: existing, error: lookupError } = await admin
    .from("queue_entries")
    .select("id, status, token")
    .eq("google_form_row_id", parsed.rowId)
    .is("deleted_at", null)
    .maybeSingle();

  if (lookupError) {
    const missingColumn = /google_form_row_id|does not exist|Could not find/i.test(
      lookupError.message
    );
    return {
      ok: false,
      error: missingColumn
        ? "Coluna google_form_row_id ausente. Rode supabase/migracao-google-form.sql no Supabase."
        : lookupError.message,
      rowId: parsed.rowId,
    };
  }

  if (existing) {
    const patch = buildGoogleFormUpdatePayload(parsed, String(existing.status));
    if (Object.keys(patch).length === 0) {
      return {
        ok: true,
        action: "unchanged",
        rowId: parsed.rowId,
        status: parsed.status,
      };
    }

    const { error } = await updateQueueEntryFields(admin, existing.id, patch);
    if (error) {
      return { ok: false, error, rowId: parsed.rowId };
    }

    return {
      ok: true,
      action: "updated",
      entryId: existing.id,
      token: existing.token,
      rowId: parsed.rowId,
      status: parsed.status,
    };
  }

  const { data: inserted, error: insertError } = await insertQueueEntry(
    admin,
    buildGoogleFormInsertPayload(parsed)
  );

  if (insertError || !inserted) {
    return {
      ok: false,
      error: insertError ?? "Falha ao inserir na fila.",
      rowId: parsed.rowId,
    };
  }

  return {
    ok: true,
    action: "created",
    entryId: inserted.id,
    token: inserted.token,
    rowId: parsed.rowId,
    status: parsed.status,
  };
}

export type GoogleFormBatchStats = {
  totalRows: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  errors: Array<{ row: number; error: string }>;
};

export async function upsertGoogleFormRows(
  admin: SupabaseClient,
  rows: GoogleFormRowPayload[],
  options?: { concurrency?: number; onProgress?: (done: number, total: number) => void }
): Promise<GoogleFormBatchStats> {
  const concurrency = Math.max(1, Math.min(options?.concurrency ?? 20, 40));
  const stats: GoogleFormBatchStats = {
    totalRows: rows.length,
    created: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    errors: [],
  };

  let done = 0;

  async function worker(batch: Array<{ row: GoogleFormRowPayload; index: number }>) {
    for (const item of batch) {
      const result = await upsertGoogleFormRow(admin, item.row);
      done += 1;
      options?.onProgress?.(done, rows.length);

      if (!result.ok) {
        stats.skipped += 1;
        stats.errors.push({ row: item.index + 2, error: result.error });
        continue;
      }

      if (result.action === "created") stats.created += 1;
      else if (result.action === "updated") stats.updated += 1;
      else stats.unchanged += 1;
    }
  }

  const chunks: Array<Array<{ row: GoogleFormRowPayload; index: number }>> = Array.from(
    { length: concurrency },
    () => []
  );
  rows.forEach((row, index) => {
    chunks[index % concurrency].push({ row, index });
  });

  await Promise.all(chunks.map((chunk) => worker(chunk)));

  return stats;
}
