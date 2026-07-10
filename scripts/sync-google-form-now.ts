/**
 * Importa todas as linhas da planilha Google Form para a fila (local / CI).
 * Uso: npm run sync:google-form
 * Requer: .env.local com SUPABASE_SERVICE_ROLE_KEY + migration google_form_row_id
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { fetchGoogleFormSheetRows } from "../src/lib/google-form-sheet-pull";
import { upsertGoogleFormRows } from "../src/lib/google-form-upsert";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

async function main() {
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Faltam NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY em .env.local");
    process.exit(1);
  }

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: colError } = await admin
    .from("queue_entries")
    .select("google_form_row_id")
    .limit(1);

  if (colError && /google_form_row_id|does not exist|Could not find/i.test(colError.message)) {
    console.error("\n❌ Migration pendente.");
    console.error("   Supabase SQL Editor → execute: supabase/migracao-google-form.sql\n");
    process.exit(1);
  }

  console.log("📄 Buscando planilha Respostas FORM VIG...");
  const pulled = await fetchGoogleFormSheetRows();
  if (!pulled.ok) {
    console.error("❌", pulled.error);
    process.exit(1);
  }

  console.log(`   ${pulled.totalInSheet} linha(s) encontrada(s). Sincronizando...`);

  const stats = await upsertGoogleFormRows(admin, pulled.rows, {
    concurrency: 25,
    onProgress: (done, total) => {
      if (done % 100 === 0 || done === total) {
        process.stdout.write(`\r   Progresso: ${done}/${total}`);
      }
    },
  });
  process.stdout.write("\n");

  await admin.from("settings").upsert(
    {
      key: "google_form_last_sync",
      value: { at: new Date().toISOString(), source: "cli", ...stats },
    },
    { onConflict: "key" }
  );

  console.log("\n✅ Sync concluída:");
  console.log(`   ${stats.created} nova(s) · ${stats.updated} atualizada(s) · ${stats.unchanged} sem alteração · ${stats.skipped} ignorada(s)`);
  if (stats.errors.length > 0) {
    console.log(`   ⚠ ${stats.errors.length} erro(s):`);
    for (const e of stats.errors.slice(0, 5)) {
      console.log(`     linha ${e.row}: ${e.error}`);
    }
  }
  console.log("\n   Confira: https://fila-lsl.vercel.app/operador\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
