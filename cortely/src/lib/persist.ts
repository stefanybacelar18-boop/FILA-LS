import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), ".data");
const STORE_FILE = path.join(DATA_DIR, "cortely-store.json");

type RootStore = {
  demo?: unknown;
  ops?: unknown;
  updated_at?: string;
};

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

export function loadPersistedStore(): RootStore {
  try {
    if (!existsSync(STORE_FILE)) return {};
    return JSON.parse(readFileSync(STORE_FILE, "utf8")) as RootStore;
  } catch {
    return {};
  }
}

export function savePersistedStore(patch: Partial<RootStore>) {
  ensureDir();
  const current = loadPersistedStore();
  const next: RootStore = {
    ...current,
    ...patch,
    updated_at: new Date().toISOString(),
  };
  writeFileSync(STORE_FILE, JSON.stringify(next, null, 2), "utf8");
}

export function persistDemo(demo: unknown) {
  savePersistedStore({ demo });
}

export function persistOps(ops: unknown) {
  savePersistedStore({ ops });
}
