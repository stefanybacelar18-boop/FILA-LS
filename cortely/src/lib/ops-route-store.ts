/**
 * Acesso ao store operacional via OpsRepository (passagem json).
 * Usado por api/ops — não altera comportamento enquanto registry all-json.
 */
import {
  bundledRegistrySeedText,
  getCachedRegistrySnapshot,
  loadRegistry,
  type RegistrySnapshot,
} from "./ops-registry";
import { createOpsRepository } from "./ops-repository";
import { opsStore } from "./ops-store";

function registryForRequest(): RegistrySnapshot {
  const cached = getCachedRegistrySnapshot();
  if (cached) return cached;
  // Fallback (testes / boot sem instrumentation): seed embutido
  return loadRegistry({
    tableExists: false,
    fileContents: bundledRegistrySeedText(),
  });
}

export function getOpsStoreViaRepository(sessionBarbershopId: string) {
  const repo = createOpsRepository({
    registry: registryForRequest(),
    sessionBarbershopId,
  });
  return repo.jsonStore;
}

/** Mesmo singleton que o store legado — para asserts de regressão. */
export function legacyOpsStoreIdentity() {
  return opsStore;
}
