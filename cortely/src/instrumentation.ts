/**
 * Boot hook: carrega o registry com fail-fast (runtime nodejs).
 * Rotas usam OpsRepository via ops-route-store (passagem json na 1.B.1).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { registerNodeRegistryBoot } = await import("./instrumentation.node");
  await registerNodeRegistryBoot();
}
