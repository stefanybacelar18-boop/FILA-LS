const FALLBACK_PIN = 'lsl2026';

export function requireLslDriverPin(): string {
  const pin = process.env.LSL_DRIVER_PIN?.trim();
  if (pin) return pin;

  if (process.env.NODE_ENV === 'production') {
    console.warn(
      '[FrotaTMS] LSL_DRIVER_PIN não definido — usando PIN padrão. Defina a variável no Render (Environment).',
    );
  }
  return FALLBACK_PIN;
}
