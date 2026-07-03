import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

const envPath = resolve(process.cwd(), ".env.local");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function timed(label, fn) {
  const t = Date.now();
  try {
    const result = await Promise.race([
      fn(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("TIMEOUT 8s")), 8000)),
    ]);
    console.log(`${label}: OK ${Date.now() - t}ms`, typeof result === "object" ? JSON.stringify(result).slice(0, 120) : result);
  } catch (e) {
    console.log(`${label}: FAIL ${Date.now() - t}ms`, e.message);
  }
}

await timed("queue_entries", async () => {
  const { data, error } = await admin.from("queue_entries").select("id").limit(3);
  if (error) throw error;
  return { count: data?.length };
});

await timed("minuta_metadata", async () => {
  const { data, error } = await admin.from("minuta_metadata").select("minuta").limit(3);
  if (error) throw error;
  return { count: data?.length };
});

await timed("settings expedicao", async () => {
  const { data, error } = await admin.from("settings").select("value").eq("key", "expedicao_diaria").maybeSingle();
  if (error) throw error;
  return data?.value;
});

await timed("settings priorities", async () => {
  const { data, error } = await admin.from("settings").select("value").eq("key", "queue_priorities").maybeSingle();
  if (error) throw error;
  return data ? "has data" : "empty";
});
