/**
 * Boot node-only do registry (importado só quando NEXT_RUNTIME=nodejs).
 */
import {
  resolveRegistryAtBoot,
  RegistryFailFastError,
} from "@/lib/ops-registry";
import {
  assertFakePaymentProviderSafeAtBoot,
  FakePaymentBootError,
} from "@/lib/payments/fake-provider";

export async function registerNodeRegistryBoot(): Promise<void> {
  try {
    assertFakePaymentProviderSafeAtBoot();
    await resolveRegistryAtBoot();
  } catch (err) {
    const message =
      err instanceof RegistryFailFastError || err instanceof FakePaymentBootError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    console.error(`cortely ops-registry boot FAILED: ${message}`);
    throw err instanceof Error ? err : new Error(message);
  }
}
