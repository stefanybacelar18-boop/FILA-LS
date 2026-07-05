/**
 * Contagens rápidas via API Supabase (sem tamanho em disco — use supabase/consulta-uso-dados.sql).
 * Uso: node scripts/consulta-uso-dados.mjs
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(root, ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      const key = t.slice(0, i).trim();
      let val = t.slice(i + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    /* .env.local opcional */
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !key) {
  console.error("Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ACTIVE_STATUSES = [
  "aguardando_descarregamento",
  "aguardando",
  "chamado",
  "em_deslocamento",
  "em_descarga",
  "aguardando_carregamento_racks",
];

async function countTable(table, filter) {
  let q = admin.from(table).select("*", { count: "exact", head: true }).is("deleted_at", null);
  if (filter) q = filter(q);
  const { count, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

async function countSince(table, days) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const { count, error } = await admin
    .from(table)
    .select("*", { count: "exact", head: true })
    .is("deleted_at", null)
    .gte("created_at", since.toISOString());
  if (error) throw new Error(`${table}(${days}d): ${error.message}`);
  return count ?? 0;
}

async function main() {
  const [total, ativos, finalizados, ausentes, historico, minutas, profiles] = await Promise.all([
    countTable("queue_entries"),
    countTable("queue_entries", (q) => q.in("status", ACTIVE_STATUSES)),
    countTable("queue_entries", (q) => q.eq("status", "finalizado")),
    countTable("queue_entries", (q) => q.eq("status", "ausente")),
    countTable("queue_history"),
    admin.from("minuta_metadata").select("*", { count: "exact", head: true }).then(({ count, error }) => {
      if (error) throw new Error(`minuta_metadata: ${error.message}`);
      return count ?? 0;
    }),
    countTable("profiles"),
  ]);

  const [ult7, ult30, ult365] = await Promise.all([
    countSince("queue_entries", 7),
    countSince("queue_entries", 30),
    countSince("queue_entries", 365),
  ]);

  const mediaSemanal = ult30 > 0 ? Math.round((ult30 / 30) * 7 * 10) / 10 : 0;
  const mbEstimado = Math.round((total * 3.5) / 1024); // ~3,5 KB/registro incl. histórico

  console.log("\n=== FilaDock — uso de dados (API) ===\n");
  console.log("Check-ins (total no banco):     ", total);
  console.log("  · Ativos na fila:             ", ativos);
  console.log("  · Finalizados:                ", finalizados);
  console.log("  · Ausentes:                   ", ausentes);
  console.log("Linhas de histórico:            ", historico);
  console.log("Minutas importadas:             ", minutas);
  console.log("Usuários (profiles):            ", profiles);
  console.log("");
  console.log("Check-ins últimos 7 dias:       ", ult7);
  console.log("Check-ins últimos 30 dias:      ", ult30);
  console.log("Check-ins últimos 365 dias:     ", ult365);
  console.log("Média estimada/semana (30d):    ", mediaSemanal);
  console.log("");
  console.log("Espaço estimado (check-ins):    ~", mbEstimado, "MB (ordem de grandeza)");
  console.log("");
  console.log("Para tamanho REAL do banco (MB/GB), rode:");
  console.log("  supabase/consulta-uso-dados.sql no SQL Editor do Supabase\n");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
