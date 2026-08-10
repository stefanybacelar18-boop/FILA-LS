export function requireLslDriverPin(): string {
  const pin = process.env.LSL_DRIVER_PIN?.trim();
  if (pin) return pin;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('LSL_DRIVER_PIN é obrigatório em produção');
  }
  return 'lsl2026';
}
