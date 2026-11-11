import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

type RootStore = {
  demo?: unknown;
  ops?: unknown;
  updated_at?: string;
};

/**
 * Em hosts serverless (/var/task é read-only) gravamos em /tmp.
 * Se nada for gravável, usa só memória do processo (sem crash no login).
 */
const memoryFallback: { store: RootStore } = { store: {} };

let resolvedFile: string | null | undefined;
let diskDisabled = false;

function candidateDirs() {
  const dirs = [
    process.env.CORTELY_DATA_DIR,
    process.env.TMPDIR,
    "/tmp/cortely-data",
    path.join(process.cwd(), ".data"),
  ].filter(Boolean) as string[];
  return Array.from(new Set(dirs));
}

function canUseDir(dir: string) {
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, ".cortely-write-probe");
    writeFileSync(probe, "ok", "utf8");
    return true;
  } catch {
    return false;
  }
}

function resolveStoreFile(): string | null {
  if (resolvedFile !== undefined) return resolvedFile;
  if (diskDisabled) {
    resolvedFile = null;
    return null;
  }

  for (const dir of candidateDirs()) {
    if (!canUseDir(dir)) continue;
    resolvedFile = path.join(dir, "cortely-store.json");
    return resolvedFile;
  }

  diskDisabled = true;
  resolvedFile = null;
  return null;
}

export function loadPersistedStore(): RootStore {
  try {
    const file = resolveStoreFile();
    if (!file || !existsSync(file)) return { ...memoryFallback.store };
    const parsed = JSON.parse(readFileSync(file, "utf8")) as RootStore;
    memoryFallback.store = parsed;
    return parsed;
  } catch {
    return { ...memoryFallback.store };
  }
}

export function savePersistedStore(patch: Partial<RootStore>) {
  const current = loadPersistedStore();
  const next: RootStore = {
    ...current,
    ...patch,
    updated_at: new Date().toISOString(),
  };
  memoryFallback.store = next;

  try {
    const file = resolveStoreFile();
    if (!file) return;
    writeFileSync(file, JSON.stringify(next, null, 2), "utf8");
  } catch {
    diskDisabled = true;
    resolvedFile = null;
  }
}

export function persistDemo(demo: unknown) {
  savePersistedStore({ demo });
}

export function persistOps(ops: unknown) {
  savePersistedStore({ ops });
}
