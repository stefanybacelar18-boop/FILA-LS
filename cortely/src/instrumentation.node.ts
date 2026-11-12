/**
 * Boot node-only do registry (importado só quando NEXT_RUNTIME=nodejs).
 */
import {
  resolveRegistryAtBoot,
  RegistryFailFastError,
} from "@/lib/ops-registry";

export async function registerNodeRegistryBoot(): Promise<void> {
  try {
    await resolveRegistryAtBoot();
  } catch (err) {
    const message =
      err instanceof RegistryFailFastError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    console.error(`cortely ops-registry boot FAILED: ${message}`);
    throw err instanceof Error ? err : new Error(message);
  }
}
