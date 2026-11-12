/**
 * Boot hook: carrega o registry com fail-fast (runtime nodejs).
 * Ligação das rotas ao OpsRepository fica para a 1.B.1 — não altera rotas aqui.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { registerNodeRegistryBoot } = await import("./instrumentation.node");
  await registerNodeRegistryBoot();
}
